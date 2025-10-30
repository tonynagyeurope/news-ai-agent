// English comments, no "any" types.
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

/** Case-insensitive header getter (API GW v2 általában lowercase-t ad). */
export function getHeader(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const key = name.toLowerCase();
  // Fast path for lowercased keys
  if (key in headers) return headers[key];
  // Fallback (rare in v2 / local invokes)
  const found = Object.keys(headers).find(h => h.toLowerCase() === key);
  return found ? headers[found] : undefined;
}

/** Check X-Internal-Token header against env INTERNAL_TOKEN. */
export function tokenOk(
  headers: Record<string, string | undefined>,
  envToken: string | undefined
): boolean {
  if (!envToken || envToken.length === 0) return true; // dev convenience
  const got = getHeader(headers, "x-internal-token");
  return got === envToken;
}

/** Minimal CORS headers for JSON responses. */
export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

/** Allow unauthenticated preflight so the browser can proceed. */
function isPreflight(event: APIGatewayProxyEventV2): boolean {
  return (event.requestContext.http.method ?? "GET").toUpperCase() === "OPTIONS";
}

/** Higher-order handler that enforces token auth. */
export function requireToken(
  inner: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>
) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    if (isPreflight(event)) {
      return { statusCode: 204, headers: jsonHeaders(), body: "" };
    }
    const ok = tokenOk(event.headers ?? {}, process.env.INTERNAL_TOKEN);
    if (!ok) {
      return {
        statusCode: 401,
        headers: jsonHeaders(),
        body: JSON.stringify({ ok: false, error: "Unauthorized" }),
      };
    }
    return inner(event);
  };
}
