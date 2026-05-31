/**
 * Discovery support: fetches the backend's live OpenAPI spec and exposes
 * helpers for the three hybrid discovery meta-tools (list_endpoints,
 * get_endpoint_schema, call_endpoint).
 *
 * Security model (hard requirements — do not relax):
 *  - Authenticates with the SCOPED tenant key resolved by the api client
 *    (env NORDIC_API_KEY, or the per-request customer key on /mcp/auth) —
 *    NEVER an internal/admin key.
 *  - /admin/* is never discoverable and never callable. Admin paths are
 *    filtered out of the spec and call_endpoint refuses them outright.
 *  - The API key is never echoed into any return value, error, or log.
 *  - call_endpoint only permits HTTP methods the spec declares for a path.
 *
 * Spec fetching is cached for 5 minutes so new endpoints appear without a
 * redeploy while not hammering the backend. If the spec is unreachable we
 * serve the last-known-good copy (flagged stale) and never crash.
 */
import { NordicApiError } from "./errors.js";
import { getResolvedApiKey } from "./apiClient.js";

/**
 * Canonical backend. All spec fetching and all discovery calls go here.
 * Internal-only override (NOT documented to end users) for infra rotation
 * and our own testing, consistent with the other NORDIC_API_* overrides.
 */
const CANONICAL_BASE = (
  process.env.NORDIC_CANONICAL_BASE_URL?.trim() || "https://api.addonnordic.dk"
).replace(/\/$/, "");

const USER_AGENT = "nordic-data-mcp/1.5.0";
const SPEC_PATH = "/openapi.json";
const SPEC_TTL_MS = 5 * 60 * 1000;

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: unknown;
  [k: string]: unknown;
}

export interface OpenApiSpec {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown>; [k: string]: unknown };
  [k: string]: unknown;
}

function stripPath(path: string): string {
  return path.split("?")[0]!.split("#")[0]!;
}

/**
 * Canonicalize a path for SECURITY policy checks: unify separators,
 * percent-decode (bounded) to reveal hidden separators/dots, resolve
 * `.`/`..` dot-segments, and lowercase. This defeats admin-bypass tricks
 * like `/Admin/keys`, `/admin%2Fkeys`, `/api/x/..%2f..%2fadmin%2fkeys`,
 * and backslash variants. NEVER use the canonical form to build the
 * outbound URL — only to decide policy.
 */
function canonicalizeForPolicy(path: string): string {
  let p = stripPath(path).replace(/\\/g, "/");
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      break;
    }
    if (decoded === p) break;
    p = decoded.replace(/\\/g, "/");
  }
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return "/" + out.join("/").toLowerCase();
}

/** SECURITY: any path that canonicalizes under /admin is off-limits. */
function isAdminPath(path: string): boolean {
  const c = canonicalizeForPolicy(path);
  return c === "/admin" || c.startsWith("/admin/");
}

/**
 * DISCOVERY-ONLY (not a security boundary): dashboard routes are operational
 * (config/usage/stats/health), not data lookups, and sit behind
 * INTERNAL_API_KEY — the scoped MCP key gets 401 on them. They're hidden from
 * the discovery surface (list_endpoints) to keep it pure data, but call_endpoint
 * still permits them, so this is intentionally NOT enforced as a hard block.
 */
function isDashboardPath(path: string): boolean {
  const c = canonicalizeForPolicy(path);
  return c === "/api/dashboard" || c.startsWith("/api/dashboard/");
}

/**
 * SECURITY: reject paths that try to smuggle traversal or hidden separators
 * before we ever build an outbound URL. Legitimate data paths never need
 * encoded slashes/dots, backslashes, or `..` segments.
 */
function assertSafeCallPath(path: string): void {
  const clean = stripPath(path);
  // `%25` is the encoding of a literal `%` — its presence means the caller is
  // double-encoding (e.g. `%252f` → `%2f` → `/`). Legitimate path-segment
  // values for this API (CVR ids, country codes, LEI codes) never need it, so
  // we reject it alongside the single-encoded separator/dot forms.
  if (/%25|%2f|%5c|%2e/i.test(clean) || clean.includes("\\")) {
    throw new NordicApiError({
      status: 400,
      code: "invalid_path",
      message:
        "Path contains encoded or backslash separators, which are not allowed. Use a plain path like /api/company/dk/22756214.",
    });
  }
  if (clean.split("/").some((s) => s === "." || s === "..")) {
    throw new NordicApiError({
      status: 400,
      code: "invalid_path",
      message:
        "Path contains traversal segments ('.' or '..'), which are not allowed.",
    });
  }
}

/**
 * SECURITY: belt-and-suspenders redaction so an API key can never appear in
 * any tool output, error message, or `details` field — even if the upstream
 * backend were ever to echo one back. Deep-walks strings/arrays/objects.
 */
const SECRET_PATTERN = /\bndk_[A-Za-z0-9_-]{8,}\b/g;

function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(SECRET_PATTERN, "ndk_***redacted***") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSecrets(v);
    }
    return out as unknown as T;
  }
  return value;
}

function methodsOf(ops: Record<string, OpenApiOperation>): string[] {
  return Object.keys(ops)
    .map((m) => m.toLowerCase())
    .filter((m) => HTTP_METHODS.has(m));
}

// ─── Spec fetching + cache ───────────────────────────────────────────────────

let specCache: { spec: OpenApiSpec; fetchedAt: number } | null = null;

async function fetchSpecFromBackend(): Promise<OpenApiSpec> {
  const apiKey = getResolvedApiKey();
  let res: Response;
  try {
    res = await fetch(`${CANONICAL_BASE}${SPEC_PATH}`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NordicApiError({
      status: 503,
      code: "spec_unreachable",
      message: `Could not reach the API spec endpoint. Last error: ${message}`,
    });
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let code = `http_${res.status}`;
    let message = `Failed to fetch the API spec (HTTP ${res.status}).`;
    try {
      const b = JSON.parse(bodyText) as Record<string, unknown>;
      if (typeof b.error === "string") code = redactSecrets(b.error);
      if (typeof b.message === "string") message = redactSecrets(b.message);
    } catch {
      /* non-JSON error body — keep defaults; never echo raw body (no key leak risk, but stay terse) */
    }
    if (res.status === 401 || res.status === 403) {
      message =
        "API key is invalid, revoked, or missing. Get or regenerate your key at https://addonnordic.com/dashboard";
    }
    throw new NordicApiError({ status: res.status, code, message });
  }

  const spec = (await res.json()) as OpenApiSpec;
  if (!spec || typeof spec !== "object" || !spec.paths) {
    throw new NordicApiError({
      status: 502,
      code: "spec_malformed",
      message: "The API spec response was malformed (no paths object).",
    });
  }
  return spec;
}

/**
 * Returns the spec, cached for SPEC_TTL_MS. On fetch failure, serves the
 * last-known-good copy flagged `stale: true`; only throws if there is no
 * cache to fall back to.
 */
export async function getSpec(): Promise<{ spec: OpenApiSpec; stale: boolean }> {
  const now = Date.now();
  if (specCache && now - specCache.fetchedAt < SPEC_TTL_MS) {
    return { spec: specCache.spec, stale: false };
  }
  try {
    const spec = await fetchSpecFromBackend();
    specCache = { spec, fetchedAt: now };
    return { spec, stale: false };
  } catch (err) {
    if (specCache) return { spec: specCache.spec, stale: true };
    throw err;
  }
}

// ─── $ref resolution (for get_endpoint_schema) ───────────────────────────────

function lookupRef(ref: string, spec: OpenApiSpec): unknown {
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = spec;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Inline `#/components/...` $refs so schemas are self-contained. Cycle- and depth-guarded. */
function resolveRefs(
  node: unknown,
  spec: OpenApiSpec,
  seen: Set<string>,
  depth: number,
): unknown {
  if (depth > 8) return node;
  if (Array.isArray(node)) {
    return node.map((n) => resolveRefs(n, spec, seen, depth + 1));
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const ref = obj["$ref"];
    if (typeof ref === "string" && ref.startsWith("#/")) {
      if (seen.has(ref)) return { $ref: ref };
      const resolved = lookupRef(ref, spec);
      if (resolved === undefined) return { $ref: ref };
      const next = new Set(seen);
      next.add(ref);
      return resolveRefs(resolved, spec, next, depth + 1);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolveRefs(v, spec, seen, depth + 1);
    }
    return out;
  }
  return node;
}

// ─── Path template matching (for method whitelist) ───────────────────────────

function templateToRegex(template: string): RegExp {
  const parts = template.split("/").map((seg) =>
    /^\{.+\}$/.test(seg)
      ? "[^/]+"
      : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp("^" + parts.join("/") + "$");
}

export interface MatchedEndpoint {
  templatePath: string;
  methods: string[];
}

/** Match a concrete request path against the spec's (possibly templated) paths. */
export function matchEndpoint(
  spec: OpenApiSpec,
  concretePath: string,
): MatchedEndpoint | null {
  const clean = stripPath(concretePath);
  const exact = spec.paths[clean];
  if (exact) return { templatePath: clean, methods: methodsOf(exact) };
  for (const [tmpl, ops] of Object.entries(spec.paths)) {
    if (!tmpl.includes("{")) continue;
    if (templateToRegex(tmpl).test(clean)) {
      return { templatePath: tmpl, methods: methodsOf(ops) };
    }
  }
  return null;
}

// ─── list_endpoints ──────────────────────────────────────────────────────────

export interface EndpointSummary {
  method: string;
  path: string;
  summary: string;
  tags?: string[];
}

export function listDataEndpoints(
  spec: OpenApiSpec,
  search?: string,
): EndpointSummary[] {
  const out: EndpointSummary[] = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    if (isAdminPath(path)) continue; // SECURITY: no admin in discovery
    if (stripPath(path) === SPEC_PATH) continue; // the spec itself is not a data endpoint
    if (isDashboardPath(path)) continue; // DISCOVERY: dashboard routes are operational, not data
    for (const [method, op] of Object.entries(ops)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const summary = (op.summary || op.description || "").toString().trim();
      out.push({
        method: method.toUpperCase(),
        path,
        summary: summary.slice(0, 200),
        ...(Array.isArray(op.tags) && op.tags.length ? { tags: op.tags } : {}),
      });
    }
  }
  out.sort((a, b) =>
    a.path === b.path
      ? a.method.localeCompare(b.method)
      : a.path.localeCompare(b.path),
  );
  const filtered =
    search && search.trim()
      ? out.filter((e) => {
          const q = search.trim().toLowerCase();
          return (
            e.path.toLowerCase().includes(q) ||
            e.summary.toLowerCase().includes(q) ||
            (e.tags ?? []).some((t) => String(t).toLowerCase().includes(q))
          );
        })
      : out;
  return redactSecrets(filtered);
}

// ─── get_endpoint_schema ─────────────────────────────────────────────────────

export function getEndpointSchema(
  spec: OpenApiSpec,
  path: string,
  method: string,
): unknown {
  const clean = stripPath(path);
  if (isAdminPath(clean)) {
    throw new NordicApiError({
      status: 403,
      code: "forbidden",
      message: "Access to /admin endpoints is not permitted via the discovery tools.",
    });
  }
  const m = method.trim().toLowerCase();

  let templatePath = clean;
  let ops = spec.paths[clean];
  if (!ops) {
    const matched = matchEndpoint(spec, clean);
    if (matched) {
      templatePath = matched.templatePath;
      ops = spec.paths[matched.templatePath];
    }
  }
  if (!ops) {
    throw new NordicApiError({
      status: 404,
      code: "unknown_endpoint",
      message: `No endpoint in the API spec matches path "${clean}". Use list_endpoints to discover valid paths.`,
    });
  }
  if (isAdminPath(templatePath)) {
    throw new NordicApiError({
      status: 403,
      code: "forbidden",
      message: "Access to /admin endpoints is not permitted via the discovery tools.",
    });
  }

  const op = ops[m];
  if (!op) {
    const allowed = methodsOf(ops).map((x) => x.toUpperCase());
    throw new NordicApiError({
      status: 405,
      code: "method_not_allowed",
      message: `Method ${m.toUpperCase()} is not defined for ${templatePath}. Allowed: ${allowed.join(", ") || "(none)"}.`,
    });
  }

  const resolved = resolveRefs(op, spec, new Set(), 0) as OpenApiOperation;
  return redactSecrets({
    path: templatePath,
    method: m.toUpperCase(),
    summary: op.summary ?? null,
    description: op.description ?? null,
    parameters: resolved.parameters ?? [],
    requestBody: resolved.requestBody ?? null,
    responses: resolved.responses ?? null,
  });
}

// ─── call_endpoint ───────────────────────────────────────────────────────────

export interface CallEndpointInput {
  method: string;
  path: string;
  params?: Record<string, unknown>;
}

export async function callEndpoint(input: CallEndpointInput): Promise<unknown> {
  const method = input.method.trim().toUpperCase();
  let path = input.path.trim();
  if (!path.startsWith("/")) path = "/" + path;
  const cleanPath = stripPath(path);

  // SECURITY: reject traversal / hidden-separator smuggling before anything else.
  assertSafeCallPath(path);

  // SECURITY: never allow admin, no matter what.
  if (isAdminPath(cleanPath)) {
    throw new NordicApiError({
      status: 403,
      code: "forbidden",
      message: "Access to /admin endpoints is not permitted via the discovery tools.",
    });
  }

  const { spec } = await getSpec();
  const matched = matchEndpoint(spec, cleanPath);
  if (!matched) {
    throw new NordicApiError({
      status: 404,
      code: "unknown_endpoint",
      message: `No endpoint in the API spec matches path "${cleanPath}". Use list_endpoints to discover valid paths.`,
    });
  }
  if (isAdminPath(matched.templatePath)) {
    throw new NordicApiError({
      status: 403,
      code: "forbidden",
      message: "Access to /admin endpoints is not permitted via the discovery tools.",
    });
  }
  // SECURITY: only methods the spec declares for this path are allowed.
  if (!matched.methods.includes(method.toLowerCase())) {
    throw new NordicApiError({
      status: 405,
      code: "method_not_allowed",
      message: `Method ${method} is not allowed for ${matched.templatePath}. Allowed: ${matched.methods.map((x) => x.toUpperCase()).join(", ") || "(none)"}.`,
    });
  }

  // Split params into path-template substitutions and query/body params.
  const params: Record<string, unknown> = { ...(input.params ?? {}) };
  const substituted = path.replace(/\{([^/}]+)\}/g, (whole, name: string) => {
    if (name in params) {
      const v = params[name];
      delete params[name];
      return encodeURIComponent(String(v));
    }
    return whole;
  });

  const [pathPart, existingQuery = ""] = substituted.split("?");

  // SECURITY (defense-in-depth): re-validate the FINAL outbound path after
  // placeholder substitution. The pre-substitution check runs on the template,
  // but `encodeURIComponent` turns an injected `%2f` into `%252f`, so a
  // malicious template param could otherwise smuggle encoded separators/dots
  // or an /admin target past the first check. Re-run the strict validator and
  // the admin guard on the concrete path before we ever build the URL.
  assertSafeCallPath(pathPart);
  if (isAdminPath(pathPart)) {
    throw new NordicApiError({
      status: 403,
      code: "forbidden",
      message: "Access to /admin endpoints is not permitted via the discovery tools.",
    });
  }

  const usp = new URLSearchParams(existingQuery);
  const headers: Record<string, string> = {
    "X-API-Key": getResolvedApiKey(),
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  let body: string | undefined;

  if (method === "GET" || method === "DELETE" || method === "HEAD") {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      usp.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  } else if (Object.keys(params).length > 0) {
    body = JSON.stringify(params);
    headers["Content-Type"] = "application/json";
  }

  const qs = usp.toString();
  const url = `${CANONICAL_BASE}${pathPart}${qs ? `?${qs}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NordicApiError({
      status: 503,
      code: "service_unavailable",
      message: `Nordic Data API is currently unreachable. Last error: ${message}`,
    });
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = `Request failed (HTTP ${res.status}).`;
    if (parsed && typeof parsed === "object") {
      const b = parsed as Record<string, unknown>;
      if (typeof b.error === "string") code = redactSecrets(b.error);
      if (typeof b.message === "string") message = redactSecrets(b.message);
    }
    // SECURITY: redact the full upstream body before it can surface via
    // the dispatcher's verbose-errors path.
    throw new NordicApiError({
      status: res.status,
      code,
      message,
      details: redactSecrets(parsed),
    });
  }
  return redactSecrets(parsed);
}
