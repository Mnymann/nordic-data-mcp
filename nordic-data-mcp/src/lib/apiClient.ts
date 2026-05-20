import { NordicApiError } from "./errors.js";

const BASE_URL =
  process.env.NORDIC_API_BASE_URL ?? "https://api.addonnordic.dk";
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

async function parseError(res: Response): Promise<NordicApiError> {
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
    source: body.source,
    details: body,
  });
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-API-Key": API_KEY!,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY!,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export function getBaseUrl(): string {
  return BASE_URL;
}
