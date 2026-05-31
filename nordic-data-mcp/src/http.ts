#!/usr/bin/env node
/**
 * Streamable HTTP transport for the Nordic Data MCP server.
 *
 * Two endpoints:
 *
 *   POST/GET/DELETE /mcp        Public, no-auth. Uses server-side
 *                               NORDIC_API_KEY for all upstream calls.
 *                               Intended for the Anthropic Connectors
 *                               Directory and freemium discovery.
 *
 *   POST/GET/DELETE /mcp/auth   Requires "Authorization: Bearer ndk_..."
 *                               on every request. The provided key is
 *                               forwarded to upstream so each paying
 *                               customer is billed against their own
 *                               tenant and quota.
 *
 * For local Claude Desktop / Cursor / Claude Code, use src/index.ts (stdio).
 */
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { formatError } from "./lib/errors.js";
import { runWithApiKey, isStrictApiKeyScopeActive } from "./lib/apiClient.js";
import {
  runWithRequestOptions,
  parseVerboseFlag,
  type RequestOptions,
} from "./lib/requestContext.js";
import { dispatchToolCall } from "./lib/dispatcher.js";
import { INSTRUCTIONS } from "./lib/instructions.js";
import { listResources, readResource } from "./resources/index.js";
import { listPrompts, getPrompt } from "./prompts/index.js";

const VERSION = "1.5.3";

function buildServer(): Server {
  const server = new Server(
    { name: "nordic-data-mcp", version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.jsonSchema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    dispatchToolCall(request.params.name, request.params.arguments),
  );

  // Documentation resources (static, no upstream calls — safe without a key).
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const r = readResource(request.params.uri);
    if (!r) throw new Error(`Unknown resource: ${request.params.uri}`);
    return { contents: [r] };
  });

  // Workflow prompts (static templates — safe without a key).
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const p = getPrompt(request.params.name, request.params.arguments ?? {});
    if (!p) throw new Error(`Unknown prompt: ${request.params.name}`);
    return p;
  });

  return server;
}

const app = express();
// Behind Railway's edge proxy: trust the first hop so `req.ip` resolves to the
// real client IP (from X-Forwarded-For) for per-IP rate limiting, instead of
// the proxy's address (which would bucket all traffic into one limit).
app.set("trust proxy", 1);
app.use(express.json({ limit: "4mb" }));

// Health endpoint — does not require an MCP session.
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "nordic-data-mcp", version: VERSION });
});

// ─── OAuth discovery shim ────────────────────────────────────────────────────
// Generic MCP clients handed only a URL (no key) follow the MCP authorization
// spec: on a 401 they probe for OAuth metadata and, finding none, fall back to
// Dynamic Client Registration at `POST /register`. This server uses static
// API-key auth, NOT OAuth — those endpoints do not exist. Without these
// handlers the client hits Express's opaque HTML 404 ("Cannot POST /register").
// We answer with a clear JSON 4xx that explains how to actually connect. It
// MUST stay a 4xx — a 200 would make an OAuth client believe registration
// succeeded and hang waiting for a token endpoint we will never expose.
function oauthNotSupported(_req: Request, res: Response): void {
  res.status(404).json({
    error: "oauth_not_supported",
    error_description:
      "This MCP server uses static API-key authentication, not OAuth 2.0 / OIDC. There is no client-registration, authorization, or token endpoint.",
    how_to_connect: {
      public: "No key needed — point your client at the public endpoint: <base>/mcp",
      authenticated:
        "Or use <base>/mcp/auth and send 'Authorization: Bearer ndk_...'. Get a key at https://addonnordic.com/dashboard",
      stdio:
        "For local clients (Claude Desktop, Cursor, Claude Code), run 'npx -y nordic-data-mcp' with NORDIC_API_KEY set.",
    },
    docs: "https://github.com/Mnymann/nordic-data-mcp#connecting-a-remote-client",
  });
}

app.all(
  [
    "/register",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/*",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/*",
    "/.well-known/openid-configuration",
    "/.well-known/openid-configuration/*",
  ],
  oauthNotSupported,
);

/**
 * Generic MCP request handler shared by `/mcp` and `/mcp/auth`. The caller
 * supplies its own session map so the two endpoints maintain independent
 * sessions (a customer's authenticated session never leaks into the public
 * pool, and vice versa).
 */
async function handleMcpRequest(
  req: Request,
  res: Response,
  transports: Map<string, StreamableHTTPServerTransport>,
): Promise<void> {
  const sessionId = req.header("mcp-session-id") ?? undefined;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    const server = buildServer();
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
}

// ─── Public, no-auth endpoint ────────────────────────────────────────────────
// Uses server-side NORDIC_API_KEY (env var). For Anthropic Directory and
// freemium discovery. Sessions kept separate from /mcp/auth.
const publicTransports = new Map<string, StreamableHTTPServerTransport>();

// Per-IP rate limit for the public endpoint. Every upstream call here is billed
// to the SERVER's own NORDIC_API_KEY, so anonymous abuse is a direct cost
// vector. The backend's per-key quota is the hard ceiling (it returns 429
// quota_exceeded); this in-memory limiter is defense-in-depth so one client
// cannot drain the shared quota or hammer upstream. /mcp/auth is intentionally
// NOT limited here — each call there is billed to the caller's own key + quota.
// Tunable via PUBLIC_RATE_LIMIT (requests) and PUBLIC_RATE_WINDOW_MS (window).
// Parse to a positive integer; fall back to a safe default on missing/NaN/0/
// negative input so a bad env value can never silently disable throttling or
// create a pathological sweep interval.
function intEnv(raw: string | undefined, fallback: number, min: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= min ? n : fallback;
}
const PUBLIC_RATE_LIMIT = intEnv(process.env.PUBLIC_RATE_LIMIT, 60, 1);
const PUBLIC_RATE_WINDOW_MS = intEnv(process.env.PUBLIC_RATE_WINDOW_MS, 60_000, 1000);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of rateBuckets) if (now >= b.resetAt) rateBuckets.delete(ip);
}, PUBLIC_RATE_WINDOW_MS).unref();

function rateLimitPublic(req: Request, res: Response): boolean {
  const now = Date.now();
  const ip = req.ip ?? "unknown";
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + PUBLIC_RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > PUBLIC_RATE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      jsonrpc: "2.0",
      error: {
        code: -32029,
        message: `Rate limit exceeded on the public endpoint (max ${PUBLIC_RATE_LIMIT} requests per ${Math.round(
          PUBLIC_RATE_WINDOW_MS / 1000,
        )}s). Retry in ${retryAfter}s, or use /mcp/auth with your own API key.`,
        data: { code: "rate_limited", retryAfter },
      },
      id: null,
    });
    return false;
  }
  return true;
}

app.all("/mcp", async (req: Request, res: Response) => {
  if (!rateLimitPublic(req, res)) return;
  try {
    await runWithRequestOptions(parseRequestOptions(req), () =>
      handleMcpRequest(req, res, publicTransports),
    );
  } catch (err) {
    console.error("MCP request failed:", formatError(err));
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

// ─── Authenticated endpoint ──────────────────────────────────────────────────
// Requires "Authorization: Bearer ndk_..." on every request. The key is
// forwarded to upstream as X-API-Key so each customer's tenant + quota
// are tracked correctly.
const authTransports = new Map<string, StreamableHTTPServerTransport>();

function extractBearerToken(req: Request): string | null {
  // Accept two formats so we work with all MCP gateways:
  //   1. "Authorization: Bearer ndk_..."  (RFC 6750 — Claude.ai, ChatGPT, our docs)
  //   2. "Authorization: ndk_..."         (Smithery.ai gateway — no Bearer prefix)
  // The format check below still ensures only well-formed ndk_ tokens are
  // forwarded upstream, so accepting the raw form does not weaken auth.
  const header = req.header("authorization");
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  const token = (bearerMatch ? bearerMatch[1]! : trimmed).trim();
  return token.length > 0 ? token : null;
}

function sendAuthError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  if (res.headersSent) return;
  // NOTE: We intentionally do NOT send a `WWW-Authenticate: Bearer …` header
  // on 401. The MCP spec (2025-06-18+) tells compliant clients to interpret
  // that header as an OAuth 2.1 challenge and begin discovery at
  // `/.well-known/oauth-protected-resource`. We use static API-key auth, not
  // OAuth, so advertising a Bearer realm causes the Smithery gateway (and any
  // other spec-compliant client) to hang in an OAuth sign-in popup waiting for
  // endpoints we will never expose. Plain 401 + JSON-RPC error is the correct
  // signal for "your key is missing or wrong — fix it and retry".
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code: status === 401 ? -32001 : -32603,
      message,
      data: { code },
    },
    id: null,
  });
}

// Methods that are safe to serve without auth. These only reveal static
// server identity and tool/resource/prompt metadata (names, descriptions,
// input schemas) and never call upstream Nordic Data API. Allowing them
// unauth'd lets MCP discovery clients (Smithery's gateway scanner, MCP
// Inspector, registry crawlers, the Claude/ChatGPT connector pre-flight)
// learn what the server offers BEFORE the end-user has been prompted for
// an API key. Without this, Smithery's scan fails on `tools/list` with
// 401 and the listing has no tool cards — which is the whole reason
// people would install the server. The actual paying calls are all in
// `tools/call`, which still requires a valid `ndk_...` key.
const UNAUTH_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "prompts/list",
  "prompts/get",
]);

/**
 * Extract per-request behavior overrides from headers and query params.
 * Smithery's HTTP gateway forwards user-supplied config fields as either
 * headers (e.g. `x-default-country: dk`) or query params (`?defaultCountry=dk`),
 * depending on field type. We accept both for robustness.
 */
function parseRequestOptions(req: Request): RequestOptions {
  const countryRaw =
    req.header("x-default-country") ??
    (typeof req.query.defaultCountry === "string"
      ? req.query.defaultCountry
      : undefined);
  const verboseRaw =
    req.header("x-verbose-errors") ??
    (typeof req.query.verboseErrors === "string"
      ? req.query.verboseErrors
      : undefined);

  const country = countryRaw?.toString().trim().toLowerCase() || undefined;
  return {
    defaultCountry: country,
    verboseErrors: parseVerboseFlag(verboseRaw),
  };
}

function isDiscoveryProbe(req: Request): boolean {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const method = (body as { method?: unknown }).method;
  return typeof method === "string" && UNAUTH_METHODS.has(method);
}

app.all("/mcp/auth", async (req: Request, res: Response) => {
  const requestOptions = parseRequestOptions(req);

  // Discovery path: initialize / ping / notifications. No auth required,
  // no upstream calls, no per-request API key needed.
  if (isDiscoveryProbe(req)) {
    try {
      await runWithRequestOptions(requestOptions, () =>
        handleMcpRequest(req, res, authTransports),
      );
    } catch (err) {
      console.error("MCP /auth discovery probe failed:", formatError(err));
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error" });
      }
    }
    return;
  }

  // Authenticated path: tools/list, tools/call, and everything else.
  const token = extractBearerToken(req);
  if (!token) {
    sendAuthError(
      res,
      401,
      "missing_authorization",
      'Missing "Authorization" header. Use "Authorization: Bearer <your-ndk-key>" or send the key directly. Get a key at https://addonnordic.com/dashboard',
    );
    return;
  }
  if (!/^ndk_[A-Za-z0-9_-]{16,}$/.test(token)) {
    sendAuthError(
      res,
      401,
      "invalid_api_key_format",
      "Authorization token does not look like a Nordic Data API key (expected format: ndk_...).",
    );
    return;
  }

  try {
    await runWithApiKey(
      token,
      async () => {
        if (!isStrictApiKeyScopeActive()) {
          throw new Error(
            "Internal error: authenticated API key scope was lost before request dispatch",
          );
        }
        await runWithRequestOptions(requestOptions, () =>
          handleMcpRequest(req, res, authTransports),
        );
      },
      { strict: true },
    );
  } catch (err) {
    console.error("MCP /auth request failed:", formatError(err));
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.error(
    `Nordic Data MCP server (HTTP) v${VERSION} listening on :${PORT} — POST /mcp (public) and /mcp/auth (Bearer)`,
  );
});
