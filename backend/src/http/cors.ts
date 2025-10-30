export function corsHeaders(origin: string): Record<string, string> {
  return {
    // Allow only your origins (dev + prod); 
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-internal-token,x-request-id",
    "Vary": "Origin",
  };
}