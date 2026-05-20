/**
 * Errors thrown by the API client. The HTTP status code and parsed error body
 * are preserved so MCP tool handlers can return helpful messages to agents.
 */
export class NordicApiError extends Error {
  status: number;
  code: string;
  source?: string;
  details?: unknown;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    source?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "NordicApiError";
    this.status = params.status;
    this.code = params.code;
    this.source = params.source;
    this.details = params.details;
  }
}

/**
 * Strip any URL-like value from an upstream `source` hint so we never echo
 * internal infrastructure (e.g. hosting hostnames) back to MCP clients.
 * We still allow short labels like "cvr.dk" or "vies" — anything that looks
 * like a URL or a long internal hostname is dropped.
 */
function safeSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const s = source.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return undefined;
  if (s.length > 40) return undefined;
  return s;
}

export function formatError(err: unknown): string {
  if (err instanceof NordicApiError) {
    const parts = [`[${err.status}] ${err.code}`, err.message];
    const src = safeSource(err.source);
    if (src) parts.push(`source=${src}`);
    return parts.filter(Boolean).join(" — ");
  }
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
