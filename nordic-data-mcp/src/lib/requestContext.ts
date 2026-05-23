import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request behavior overrides set by the caller. Currently:
 *
 *   defaultCountry  — ISO 3166-1 alpha-2 (lowercase) used as a fallback
 *                     when a tool argument omits `country`. Applies only
 *                     to tools that use the 12-country lowercase set
 *                     (NOT validate_vat, which uses a different list).
 *
 *   verboseErrors   — When true, tool errors include an additional
 *                     structured JSON block with `status`, `code`,
 *                     upstream `source`, and parsed error `details` —
 *                     useful when integrating from CI or building
 *                     debugger UIs around an agent.
 *
 * Sources, in order of precedence per request:
 *   1. AsyncLocalStorage scope set by the HTTP entrypoint after parsing
 *      request headers / query params (Smithery's gateway forwards user
 *      config this way).
 *   2. Process env vars NORDIC_DEFAULT_COUNTRY / NORDIC_VERBOSE_ERRORS
 *      for stdio mode (Claude Desktop, Cursor, etc.) where there are no
 *      per-request headers.
 */
export interface RequestOptions {
  defaultCountry?: string;
  verboseErrors?: boolean;
}

const storage = new AsyncLocalStorage<RequestOptions>();

const TRUTHY = new Set(["1", "true", "yes", "on"]);

const ENV_DEFAULT_COUNTRY =
  process.env.NORDIC_DEFAULT_COUNTRY?.trim().toLowerCase() || undefined;
const ENV_VERBOSE_ERRORS = TRUTHY.has(
  (process.env.NORDIC_VERBOSE_ERRORS ?? "").trim().toLowerCase(),
);

export function runWithRequestOptions<T>(
  opts: RequestOptions,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(opts, fn);
}

export function getRequestOptions(): RequestOptions {
  const scope = storage.getStore();
  return {
    defaultCountry: scope?.defaultCountry ?? ENV_DEFAULT_COUNTRY,
    verboseErrors: scope?.verboseErrors ?? ENV_VERBOSE_ERRORS,
  };
}

/**
 * Parse a string value (from a header or query param) into a boolean
 * using the same truthy convention as the env var.
 */
export function parseVerboseFlag(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s) return undefined;
  return TRUTHY.has(s);
}
