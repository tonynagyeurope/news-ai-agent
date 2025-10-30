// src/http/route.ts
import { corsHeaders } from "./cors.js";

export async function router(event: { httpMethod: string; headers?: Record<string,string> }) {
  const reqOrigin = event.headers?.origin ?? "";
  const origin = isAllowed(reqOrigin) ? reqOrigin : process.env.FALLBACK_ORIGIN ?? "https://news.tonynagy.io";

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        "Access-Control-Max-Age": "600",
      },
      body: "",
    };
  }

  // ... GET/POST normal
}

function isAllowed(origin: string): boolean {
  const allow = (process.env.CORS_ORIGINS ?? "https://news.tonynagy.io")
    .split(",")
    .map(s => s.trim());
  return allow.includes(origin);
}
