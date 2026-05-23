import { AsyncLocalStorage } from "node:async_hooks";
import { NordicApiError } from "./errors.js";

/**
 * Default hosts (built-in, mirrored deployments of the Nordic Data API).
 * End users do not configure these — failover is automatic and invisible.
 *
 * Internal-only env vars can override for our own testing / infra rotation:
 *   NORDIC_API_PRIMARY, NORDIC_API_FALLBACK, NORDIC_API_BASE_URL
 * These are NOT documented in the public README on purpose.
 */
const DEFAULT_PRIMARY = "https://nordic-data-api-production-b59e.up.railway.app";
const DEFAULT_FALLBACK = "https://nordic-data-api-1.onrender.com";

function resolveHosts(): string[] {
  const primary = process.env.NORDIC_API_PRIMARY?.trim() || DEFAULT_PRIMARY;
  const fallback = process.env.NORDIC_API_FALLBACK?.trim() || DEFAULT_FALLBACK;
  const legacy = process.env.NORDIC_API_BASE_URL?.trim();

  // If a single base URL is explicitly set, honor it (single-host mode).
  if (legacy && !process.env.NORDIC_API_PRIMARY) {
    return [legacy.replace(/\/$/, "")];
  }

  const hosts = [primary];
  if (fallback && fallback !== primary) hosts.push(fallback);
  return hosts.map((h) => h.replace(/\/$/, ""));
}

const HOSTS = resolveHosts();
const DEFAULT_API_KEY = process.env.NORDIC_API_KEY;

const USER_AGENT = "nordic-data-mcp/1.3.3";

/**
 * Per-request API key override. Used by the authenticated HTTP endpoint
 * (`/mcp/auth`) to forward the customer's own `ndk_...` key to upstream,
 * so usage is tracked against their tenant + quota. When no contextual
 * scope is active, the module-level `NORDIC_API_KEY` env var is used
 * (stdio mode and the public `/mcp` endpoint).
 *
 * `strict: true` makes the scope fail-closed: if the AsyncLocalStorage
 * context is somehow lost between the request boundary and the upstream
 * call, we throw rather than silently billing the server tenant. This is
 * critical for `/mcp/auth` — losing the customer key mid-request would
 * leak server-key usage into a paying customer's session.
 */
interface ApiKeyScope {
  apiKey: string;
  strict: boolean;
}

const apiKeyStorage = new AsyncLocalStorage<ApiKeyScope>();

/**
 * Run an async function with a per-request API key in context. All
 * `apiGet` / `apiPost` calls inside `fn` will use this key instead of
 * the env-var default. When `strict` is true, missing context inside
 * `fn` will throw rather than fall back to the env key — use this for
 * the authenticated HTTP endpoint where the wrong tenant must never
 * be billed.
 */
export function runWithApiKey<T>(
  apiKey: string,
  fn: () => Promise<T>,
  options: { strict?: boolean } = {},
): Promise<T> {
  return apiKeyStorage.run(
    { apiKey, strict: options.strict ?? false },
    fn,
  );
}

/**
 * Throws if no `NORDIC_API_KEY` is configured in the environment.
 * Called at startup by the stdio entrypoint (`src/index.ts`), which
 * cannot rely on per-request overrides.
 */
export function ensureApiKeyConfigured(): void {
  if (!DEFAULT_API_KEY) {
    throw new Error(
      "NORDIC_API_KEY environment variable is required. Get a key at https://addonnordic.com",
    );
  }
}

function resolveApiKey(): string {
  const scope = apiKeyStorage.getStore();
  if (scope) return scope.apiKey;
  // No ALS scope active — this is the normal path for stdio mode and the
  // public /mcp endpoint, both of which depend on NORDIC_API_KEY from env.
  // The authenticated /mcp/auth endpoint enters via runWithApiKey({strict:true}),
  // so if we reach here from that path the env key would silently mis-bill
  // a paying customer. `isStrictApiKeyScopeActive()` is checked at request
  // entry (`requireStrictApiKey` middleware) to fail fast before we ever
  // get here in that broken state.
  if (DEFAULT_API_KEY) return DEFAULT_API_KEY;
  throw new NordicApiError({
    status: 401,
    code: "missing_api_key",
    message:
      "No API key available for this request. Set NORDIC_API_KEY or use the authenticated /mcp/auth endpoint with an Authorization: Bearer header.",
  });
}

/**
 * Returns true iff a strict per-request key scope is active in the current
 * async context. The authenticated HTTP endpoint uses this immediately
 * before invoking the MCP transport to assert that ALS context has actually
 * propagated, so we never silently fall back to the server key.
 */
export function isStrictApiKeyScopeActive(): boolean {
  const scope = apiKeyStorage.getStore();
  return scope?.strict === true;
}

interface RawErrorBody {
  error?: string;
  message?: string;
  source?: string;
  expected?: string;
  [key: string]: unknown;
}

async function parseError(res: Response): Promise<NordicApiError> {
  const body = (await res.json().catch(() => ({}))) as RawErrorBody;
  const code = body.error ?? `http_${res.status}`;

  // Friendly mapping for quota-exceeded — backend agent specifically asked us
  // not to surface a generic "server error" here. Customers seeing this need
  // to know it's a quota issue and where to upgrade.
  if (res.status === 429) {
    const detail =
      typeof body.message === "string" && body.message.trim().length > 0
        ? body.message.trim()
        : "Daily API quota exceeded.";
    return new NordicApiError({
      status: 429,
      code: "quota_exceeded",
      message: `${detail} View your usage and upgrade your plan at https://addonnordic.com/dashboard`,
      source: body.source,
      details: body,
    });
  }

  // Friendly mapping for invalid / revoked API key.
  if (res.status === 401 || res.status === 403) {
    const detail =
      typeof body.message === "string" && body.message.trim().length > 0
        ? body.message.trim()
        : "API key is invalid, revoked, or missing.";
    return new NordicApiError({
      status: res.status,
      code: code || "unauthorized",
      message: `${detail} Get or regenerate your key at https://addonnordic.com/dashboard`,
      source: body.source,
      details: body,
    });
  }

  const message =
    body.message ??
    body.expected ??
    body.error ??
    res.statusText ??
    `HTTP ${res.status}`;
  // Never default `source` to our internal host URL — that would leak
  // infrastructure to MCP clients. Only forward upstream's own `source`
  // hint (e.g. "cvr.dk", "vies"), which describes the data origin.
  return new NordicApiError({
    status: res.status,
    code,
    message,
    source: body.source,
    details: body,
  });
}

function isRetryable(status: number, mirrorMode: boolean): boolean {
  // Always retry: 5xx server errors and 429 rate limit.
  if (status >= 500 || status === 429) return true;
  // Mirror mode (multiple hosts configured as mirrors of the same service):
  // also retry on 404. Mirrors should agree on existence; if they disagree,
  // one is stale (e.g. mid-deploy). Costs one extra call on genuine misses,
  // but eliminates "404 on stale mirror" false negatives.
  if (mirrorMode && status === 404) return true;
  return false;
}

interface FetchOptions {
  method: "GET" | "POST";
  body?: unknown;
}

async function callWithFailover<T>(
  path: string,
  opts: FetchOptions,
): Promise<T> {
  let lastError: unknown;
  const mirrorMode = HOSTS.length > 1;
  const apiKey = resolveApiKey();

  for (let i = 0; i < HOSTS.length; i++) {
    const host = HOSTS[i]!;
    const isFallback = i > 0;
    try {
      const headers: Record<string, string> = {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      };
      if (opts.method === "POST") headers["Content-Type"] = "application/json";

      const res = await fetch(`${host}${path}`, {
        method: opts.method,
        headers,
        body: opts.method === "POST" ? JSON.stringify(opts.body) : undefined,
      });

      if (!res.ok) {
        const err = await parseError(res);
        // 401/403 are NOT retryable — a bad key won't become good on the mirror.
        const retryable =
          isRetryable(res.status, mirrorMode) &&
          res.status !== 401 &&
          res.status !== 403;
        if (retryable && i < HOSTS.length - 1) {
          // stderr only — stdout is reserved for the MCP stdio protocol.
          // Host URL is intentionally not logged (internal infrastructure).
          console.error(
            `[nordic-data-mcp] upstream returned ${res.status} — retrying`,
          );
          lastError = err;
          continue;
        }
        throw err;
      }

      if (isFallback) {
        console.error(`[nordic-data-mcp] served from fallback upstream`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof NordicApiError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (i < HOSTS.length - 1) {
        console.error(
          `[nordic-data-mcp] network error: ${message} — retrying`,
        );
        lastError = err;
        continue;
      }
      throw new NordicApiError({
        status: 503,
        code: "service_unavailable",
        message: `Nordic Data API is currently unreachable. Last error: ${message}`,
      });
    }
  }

  throw lastError ??
    new NordicApiError({
      status: 503,
      code: "service_unavailable",
      message: "Nordic Data API is currently unreachable.",
    });
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return callWithFailover<T>(path, { method: "GET" });
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  return callWithFailover<T>(path, { method: "POST", body });
}
