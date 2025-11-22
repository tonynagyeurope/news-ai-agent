// /httpErrors.ts
// English comments only — strict, no 'any'.

export interface HttpLikeHeaders {
  get(name: string): string | null;
}

export interface HttpErrorLike extends Error {
  status?: number;
  headers?: HttpLikeHeaders | Record<string, string | string[] | undefined>;
  bodyText?: string;
}

/** Typed error for HTTP 429 rate limiting, includes remaining seconds and an absolute 'until' timestamp. */
export class RateLimitError extends Error {
  public readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Type guard that checks for a generic HTTP-like error shape. */
export function isHttpErrorLike(e: unknown): e is HttpErrorLike {
  return !!e && typeof e === "object" && "message" in e;
}

/** Case-insensitive header getter supporting both Fetch Headers and plain objects. */
function getHeaderCaseInsensitive(
  headers: HttpLikeHeaders | Record<string, string | string[] | undefined> | undefined,
  name: string
): string | null {
  if (!headers) return null;

  // Native Fetch Headers case
  if (typeof (headers as HttpLikeHeaders).get === "function") {
    return (headers as HttpLikeHeaders).get(name);
  }

  // Plain object case
  const rec = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(rec).find(k => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const v = rec[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * Parses Retry-After header to seconds.
 * Supports both delta-seconds (e.g., "59") and HTTP-date values.
 */
export function parseRetryAfterSeconds(
  headers: HttpLikeHeaders | Record<string, string | string[] | undefined> | undefined
): number | null {
  const raw = getHeaderCaseInsensitive(headers, "Retry-After");
  if (!raw) return null;

  const trimmed = raw.trim();

  // Delta-seconds form
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt)) return Math.max(1, Math.floor(asInt));

  // HTTP-date form
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    const secs = Math.ceil((ts - Date.now()) / 1000);
    return secs > 0 ? secs : 1;
  }

  return null;
}
