// src/handlers/searchNews.ts
// @author: Tony Nagy | https://github.com/tonynagyeurope/news-ai-agent
//
// Responsibilities:
// - Validate input (q/lang/maxItems)
// - Optional rate-limit via Upstash Redis REST (IP-based)
// - Optional 120s cache via Upstash Redis REST
// - Fetch news from the selected provider (gnews | newsapi | auto)
// - Normalize into a stable schema and return
//
// Environment variables (configured in serverless.yml):
// - NEWS_PROVIDER = 'gnews' | 'newsapi' | 'auto' (default: 'gnews')
// - GNEWS_API_KEY (required if provider is gnews/auto)
// - NEWSAPI_KEY  (required if provider is newsapi/auto)
// - UPSTASH_REDIS_REST_URL (optional for cache/ratelimit)
// - UPSTASH_REDIS_REST_TOKEN (optional for cache/ratelimit)
// - RATE_LIMIT_MAX (optional, e.g., "60")
// - RATE_LIMIT_WINDOW_SECONDS (optional, e.g., "300")
//
// HTTP: POST /api/news/search
// Body: { q: string; lang?: string; maxItems?: number }
//
// Returns: { ok, provider, cached, tookMs, items: NewsItem[] }

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { requireToken } from "../lib/auth.js";
import { corsHeaders } from "src/http/cors.js";
import { env, optEnv, sha256Hex, toInt } from "src/lib/env.js";
import { UpstashClient } from "src/utils/upstashClient.js";

// ----------------------------- Types -----------------------------

interface SearchInput {
  q?: string;
  lang?: string;
  maxItems?: number;
}

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO 8601
  description?: string;
}

type ProviderName = "gnews" | "newsapi";

interface ProviderResult {
  provider: ProviderName;
  items: NewsItem[];
}

// ------------------------ Utilities ------------------------------

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // strip tracking params
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("utm_term");
    u.searchParams.delete("utm_content");
    return u.toString();
  } catch {
    return url;
  }
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = sha256Hex(`${normalizeUrl(it.url)}|${it.title.trim().toLowerCase()}`);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function getClientIp(event: APIGatewayProxyEventV2): string {
  // Prefer X-Forwarded-For to be closer to the original client when behind proxies
  const headers = event.headers ?? {};
  const xff = headers["x-forwarded-for"] ?? headers["X-Forwarded-For"];
  if (typeof xff === "string" && xff.length > 0) {
    // "client, proxy1, proxy2" -> take first
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const src = event.requestContext?.http?.sourceIp;
  return src ?? "0.0.0.0";
}

function nowMs(): number {
  return Date.now();
}

// Abort a fetch after ms
function makeAbortSignal(timeoutMs: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), timeoutMs).unref?.();
  return ctrl.signal;
}

function parseJsonBody<T>(event: APIGatewayProxyEventV2): T | undefined {
  if (!event.body) return undefined;
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return undefined;
  }
}

// Normalize NewsAPI language codes to provider-compatible
function normalizeLang(lang?: string): string {
  // Basic normalization: fallback 'en'
  // GNews: two-letter; NewsAPI: two-letter. Keep it simple.
  if (!lang) return "en";
  const l = lang.toLowerCase();
  return l.length === 2 ? l : "en";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ----------------------- Rate Limiting ---------------------------

async function maybeRateLimit(upstash: UpstashClient | undefined, ip: string | undefined): Promise<void> {
  if (!upstash) return;
  const max = toInt(optEnv("RATE_LIMIT_MAX"), 60); // default 60 req window
  const windowSec = toInt(optEnv("RATE_LIMIT_WINDOW_SECONDS"), 300); // default 5 min
  const key = `rl:${ip ?? "unknown"}`;

  const count = await upstash.incr(key);
  if (count === 1) {
    // first hit in window – set TTL
    await upstash.expire(key, windowSec);
  }
  if (count > max) {
    throw Object.assign(new Error("Too many requests"), { statusCode: 429 });
  }
}

// ----------------------- Providers --------------------------------

// GNews docs: https://gnews.io
// GET https://gnews.io/api/v4/search?q=QUERY&lang=en&max=10&token=APIKEY&sortby=publishedAt
async function fetchGNews(q: string, lang: string, maxItems: number, signal: AbortSignal): Promise<ProviderResult> {
  const key = env("GNEWS_API_KEY");
  const params = new URLSearchParams({
    q,
    lang,
    max: String(maxItems),
    token: key,
    sortby: "publishedAt",
  });
  const url = `https://gnews.io/api/v4/search?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    signal,
    headers: { "User-Agent": "news-ai-agent/1.0 (+https://example.com)" },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`GNews HTTP ${res.status}: ${msg}`);
  }
  const data = (await res.json()) as {
    totalArticles?: number;
    articles?: Array<{
      title?: string;
      url?: string;
      publishedAt?: string;
      description?: string;
      source?: { name?: string } | null;
    }>;
  };

  const items: NewsItem[] = (data.articles ?? [])
    .filter((a) => !!a && !!a.title && !!a.url)
    .map((a) => ({
      title: a.title!,
      url: a.url!,
      source: a.source?.name ?? "GNews",
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : new Date().toISOString(),
      description: a.description ?? undefined,
    }));

  return { provider: "gnews", items };
}

// NewsAPI docs: https://newsapi.org
// GET https://newsapi.org/v2/everything?q=QUERY&language=en&pageSize=10&sortBy=publishedAt&apiKey=KEY
async function fetchNewsAPI(q: string, lang: string, maxItems: number, signal: AbortSignal): Promise<ProviderResult> {
  const key = env("NEWSAPI_KEY");
  const params = new URLSearchParams({
    q,
    language: lang,
    pageSize: String(maxItems),
    sortBy: "publishedAt",
    apiKey: key,
  });
  const url = `https://newsapi.org/v2/everything?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    signal,
    headers: { "User-Agent": "news-ai-agent/1.0 (+https://example.com)" },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`NewsAPI HTTP ${res.status}: ${msg}`);
  }
  const data = (await res.json()) as {
    status?: string;
    totalResults?: number;
    articles?: Array<{
      title?: string;
      url?: string;
      publishedAt?: string;
      description?: string;
      source?: { name?: string } | null;
    }>;
  };

  const items: NewsItem[] = (data.articles ?? [])
    .filter((a) => !!a && !!a.title && !!a.url)
    .map((a) => ({
      title: a.title!,
      url: a.url!,
      source: a.source?.name ?? "NewsAPI",
      publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : new Date().toISOString(),
      description: a.description ?? undefined,
    }));

  return { provider: "newsapi", items };
}

async function pickProvider(
  q: string,
  lang: string,
  maxItems: number,
  signal: AbortSignal
): Promise<ProviderResult> {
  const mode = env("NEWS_PROVIDER", "gnews").toLowerCase();
  const target: ProviderName =
    mode === "gnews" || mode === "newsapi" ? (mode as ProviderName) : "gnews";

  if (target === "gnews") {
    try {
      return await fetchGNews(q, lang, maxItems, signal);
    } catch (err) {
      // Fallback to NewsAPI if available
      if (optEnv("NEWSAPI_KEY")) {
        return await fetchNewsAPI(q, lang, maxItems, signal);
      }
      throw err;
    }
  }

  // target === 'newsapi'
  try {
    return await fetchNewsAPI(q, lang, maxItems, signal);
  } catch (err) {
    if (optEnv("GNEWS_API_KEY")) {
      return await fetchGNews(q, lang, maxItems, signal);
    }
    throw err;
  }
}

// --------------------------- Handler ------------------------------

async function searchNews(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const t0 = nowMs();

  // Optional Upstash setup (cache + rate limit)
  const upstashUrl = optEnv("UPSTASH_REDIS_REST_URL");
  const upstashToken = optEnv("UPSTASH_REDIS_REST_TOKEN");
  const upstash = upstashUrl && upstashToken ? new UpstashClient(upstashUrl, upstashToken) : undefined;

  // Parse and validate input
  const body: Partial<SearchInput> = parseJsonBody<SearchInput>(event) ?? {};
  const qRaw: string = (body.q ?? "").trim();
  const lang: string = normalizeLang(body.lang);
  const maxItems: number = clamp(body.maxItems ?? 10, 1, 25);
  const origin = process.env.CORS_ORIGINS ?? "https://news.tonynagy.io"

  if (qRaw.length < 2) {
    return {
      statusCode: 400,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        ok: false,
        error: "Invalid 'q': provide at least 2 characters.",
        example: { q: "AI regulation", lang: "en", maxItems: 10 },
      }),
    };
  }

  // IP for rate limit (API Gateway v2)
  const ip = getClientIp(event);

  try {
    // Rate limit (optional)
    await maybeRateLimit(upstash, ip);

    // Cache key
    const providerPref = env("NEWS_PROVIDER", "gnews").toLowerCase();
    const cacheKey = `search:${sha256Hex([qRaw, lang, String(maxItems), providerPref].join("|"))}`;

    // Try cache (if configured)
    if (upstash) {
      const cached = await upstash.get(cacheKey);
      if (cached) {
        const tookMs = nowMs() - t0;
        return {
          statusCode: 200,
          headers: corsHeaders(origin),
          body: JSON.stringify({
            ok: true,
            provider: JSON.parse(cached).provider as ProviderName,
            cached: true,
            tookMs,
            items: (JSON.parse(cached).items as NewsItem[]) ?? [],
          }),
        };
      }
    }

    // Provider fetch with timeout
    const signal = makeAbortSignal(5000); // 5s network guard
    const { provider, items } = await pickProvider(qRaw, lang, maxItems, signal);

    // 1) dedupe + sort by recency
    const dedupedSorted = dedupeAndSort(items);

    // 2) freshness window (fallback if too strict)
    const maxAgeHours = 48; // optionally: toInt(optEnv("FRESHNESS_HOURS"), 48)
    const threshold = Date.now() - maxAgeHours * 3600 * 1000;
    const fresh = dedupedSorted.filter(i => new Date(i.publishedAt).getTime() >= threshold);

    // 3) cut to size
    const finalItems = (fresh.length > 0 ? fresh : dedupedSorted).slice(0, maxItems);

    // Cache result for 120s
    if (upstash) {
      const ttl = 120;
      const payload = JSON.stringify({ provider, items: finalItems });
      await upstash.setex(cacheKey, payload, ttl);
    }

    const tookMs = nowMs() - t0;
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        ok: true,
        provider,
        cached: false,
        tookMs,
        items: finalItems,
      }),
    };
  } catch (err: unknown) {
    const tookMs = nowMs() - t0;

    // Handle rate limit
    if ((err as { statusCode?: number }).statusCode === 429) {
      return {
        statusCode: 429,
        headers: corsHeaders(origin),
        body: JSON.stringify({
          ok: false,
          error: "Too many requests. Please try again later.",
          tookMs,
        }),
      };
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "error",
        msg: "search handler failed",
        error: message,
      })
    );

    return {
      statusCode: 502,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        ok: false,
        error: message,
        tookMs,
      }),
    };
  }
};

export const handler = requireToken(searchNews);