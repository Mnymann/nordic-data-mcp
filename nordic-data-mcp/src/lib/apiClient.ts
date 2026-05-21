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
const API_KEY = process.env.NORDIC_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NORDIC_API_KEY environment variable is required. Get a key at https://addonnordic.com",
  );
}

const USER_AGENT = "nordic-data-mcp/1.2.3";

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

  for (let i = 0; i < HOSTS.length; i++) {
    const host = HOSTS[i]!;
    const isFallback = i > 0;
    try {
      const headers: Record<string, string> = {
        "X-API-Key": API_KEY!,
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
        if (isRetryable(res.status, mirrorMode) && i < HOSTS.length - 1) {
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
