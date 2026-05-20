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
 * Format an unknown error into a single human-readable line suitable for
 * returning to an MCP client. Does NOT log request/response bodies (PII).
 */
export function formatError(err: unknown): string {
  if (err instanceof NordicApiError) {
    const parts = [`[${err.status}] ${err.code}`, err.message];
    if (err.source) parts.push(`source=${err.source}`);
    return parts.filter(Boolean).join(" — ");
  }
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
