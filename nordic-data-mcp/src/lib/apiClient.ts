import { NordicApiError } from "./errors.js";

/**
 * Resolves the list of API hosts to try in order. Supports:
 *   - NORDIC_API_PRIMARY + NORDIC_API_FALLBACK (failover mode)
 *   - NORDIC_API_BASE_URL (single host, legacy / default)
 * If primary is set without fallback, runs with just primary.
 * If nothing is set, defaults to https://api.addonnordic.dk.
 */
function resolveHosts(): string[] {
  const primary = process.env.NORDIC_API_PRIMARY?.trim();
  const fallback = process.env.NORDIC_API_FALLBACK?.trim();
  const legacy = process.env.NORDIC_API_BASE_URL?.trim();

  const hosts: string[] = [];
  if (primary) hosts.push(primary);
  if (fallback && fallback !== primary) hosts.push(fallback);
  if (hosts.length === 0) {
    hosts.push(legacy ?? "https://api.addonnordic.dk");
  }
  return hosts.map((h) => h.replace(/\/$/, ""));
}

const HOSTS = resolveHosts();
const API_KEY = process.env.NORDIC_API_KEY;

if (!API_KEY) {
  throw new Error(
    "NORDIC_API_KEY environment variable is required. Get a key at https://addonnordic.dk",
  );
}

const USER_AGENT = "nordic-data-mcp/0.1.0";

interface RawErrorBody {
  error?: string;
  message?: string;
  source?: string;
  expected?: string;
  [key: string]: unknown;
}

async function parseError(
  res: Response,
  host: string,
): Promise<NordicApiError> {
  const body = (await res.json().catch(() => ({}))) as RawErrorBody;
  const code = body.error ?? `http_${res.status}`;
  const message =
    body.message ??
    body.expected ??
    body.error ??
    res.statusText ??
    `HTTP ${res.status}`;
  return new NordicApiError({
    status: res.status,
    code,
    message,
    source: body.source ?? host,
    details: body,
  });
}

function isRetryable(status: number): boolean {
  // 5xx server errors and 429 rate limit → retry on next host.
  // 4xx (other than 429) is a client error and won't be fixed by failover.
  return status >= 500 || status === 429;
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
        const err = await parseError(res, host);
        if (isRetryable(res.status) && i < HOSTS.length - 1) {
          // stderr is safe — stdout is reserved for the MCP stdio protocol.
          console.error(
            `[nordic-data-mcp] ${host} returned ${res.status} for ${opts.method} ${path} — failing over to next host`,
          );
          lastError = err;
          continue;
        }
        throw err;
      }

      if (isFallback) {
        console.error(
          `[nordic-data-mcp] fallback host ${host} succeeded for ${opts.method} ${path}`,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      // fetch() throws on network errors (DNS, connection refused, timeout).
      // NordicApiError was already thrown above and we hit this only if it
      // was thrown above with no more hosts to try.
      if (err instanceof NordicApiError) throw err;

      const message = err instanceof Error ? err.message : String(err);
      if (i < HOSTS.length - 1) {
        console.error(
          `[nordic-data-mcp] network error on ${host} for ${opts.method} ${path}: ${message} — failing over to next host`,
        );
        lastError = err;
        continue;
      }
      throw new NordicApiError({
        status: 503,
        code: "all_hosts_unavailable",
        message: `All Nordic Data API hosts failed. Last error: ${message}`,
        source: host,
      });
    }
  }

  // Defensive — loop should always either return or throw.
  throw lastError ??
    new NordicApiError({
      status: 503,
      code: "all_hosts_unavailable",
      message: "All Nordic Data API hosts failed.",
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

export function getHosts(): readonly string[] {
  return HOSTS;
}
