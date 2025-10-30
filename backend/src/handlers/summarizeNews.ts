// src/handlers/summarizeNews.ts
// @author: Tony Nagy | https://github.com/tonynagyeurope/news-ai-agent
//
// Responsibilities:
// - Validate input: { items: NewsItem[], lang?: string, maxItems?: number }
// - Trim & normalize items
// - Construct a compact prompt with citations
// - Call OpenAI (FAST or QUALITY model based on env)
// - Safe fallbacks: if OpenAI fails, return extractive bullets
//
// Env:
// - OPENAI_API_KEY (required)
// - OPENAI_MODEL_FAST (default: gpt-5-nano)        -> low-latency
// - OPENAI_MODEL_QUALITY (default: gpt-5-mini)     -> higher quality
//
// HTTP: POST /api/news/summarize
// Body: { items: NewsItem[], lang?: "en" | "de" | "fr" | "es" | ..., maxItems?: number }

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { requireToken } from "../lib/auth.js";
import { corsHeaders } from "src/http/cors.js";
import { optEnv, sha256Hex } from "src/lib/env.js";
import { UpstashClient } from "src/utils/upstashClient.js";
import { styleAwareFallback } from "src/summarize/styleAwareFallback.js";
import { buildPromptJson } from "../summarize/buildPromptJson.js";
import type { SummaryJson } from "@shared/summary.types.js";
import { normalizeBlocksForCache } from "src/summarize/normalizeBlocks.js";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}

type SummaryStyle = "headline-first" | "key-points" | "risks" | "balanced";

interface SummarizeInput {
  items?: NewsItem[];
  lang?: string;
  maxItems?: number;
  mode?: "fast" | "quality";
  summaryStyle?: SummaryStyle;
}

// cache payload type
interface SummCachePayload {
  mode: "fast" | "quality";
  style: SummaryStyle;
  count: number;
  summaryText?: string; // present in fast OR quality-fallback
  header?: string;
  intro?: string;
  outro?: string;
  blocks?: Array<{
    kind: "headline" | "keyPoint" | "risk" | "balanced";
    idx: number;
    title: string;
    url: string;
    source?: string;
    date?: string;
    facts?: string[];
  }>;
  at: string; // ISO
}

const SUMM_V = process.env.SUMM_V ?? "7"; 
const DISABLE_CACHE = process.env.SUMM_DEBUG_NOCACHE === "1";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function normalizeLang(lang?: string): string { return !lang ? "en" : (lang.length === 2 ? lang.toLowerCase() : "en"); }
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
function compactItems(items: NewsItem[], limit: number): NewsItem[] {
  return items.filter(i => i && i.title && i.url && i.source && i.publishedAt).slice(0, limit);
}

function usesMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes("nano") || m.includes("mini");
}

async function callOpenAI(system: string, user: string, mode: "fast" | "quality"): Promise<string> {
  const apiKey = env("OPENAI_API_KEY");
  const modelFast = env("OPENAI_MODEL_FAST", "gpt-5-nano");
  const modelQuality = env("OPENAI_MODEL_QUALITY", "gpt-5-mini");
  const model = mode === "quality" ? modelQuality : modelFast;

  // Inner call with one specific token param
  async function callOnce(useCompletionTokens: boolean, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };

      if (useCompletionTokens) {
        // Newer “nano/mini” style
        body.max_completion_tokens = 700;
      } else {
        // Classic chat-completions param
        body.max_tokens = 700;
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { 
          Authorization: `Bearer ${apiKey}`, 
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`OpenAI HTTP ${res.status}: ${txt}`);
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("OpenAI returned empty content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  const preferCompletion = usesMaxCompletionTokens(model);
  try {
    return await callOnce(preferCompletion, 12_000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unsupported_parameter|max_tokens|max_completion_tokens/i.test(msg)) {
      try {
        return await callOnce(!preferCompletion, 8_000);
      } catch (e2) {
        throw e2 instanceof Error ? e2 : new Error(String(e2));
      }
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

// --- stable cache key builder (includes style + mode) ---

function makeSummCacheKey(args: {
  lang: string; maxItems: number; mode: "fast" | "quality"; style: SummaryStyle; items: NewsItem[];
}): string {
  // Minimal stable projection + stable ordering (url+title)
  const items = [...args.items]
    .map(i => ({ t: i.title ?? "", u: i.url ?? "" }))
    .sort((a, b) => (a.u + a.t).localeCompare(b.u + b.t));

  const payload = JSON.stringify({
    v: SUMM_V,          // 2) include version in the hashed payload
    lang: args.lang,
    max: args.maxItems,
    mode: args.mode,
    style: args.style,
    items,
  });

  // 3) add version prefix to the key to hard-split caches across versions
  return `summ:v${SUMM_V}:${sha256Hex(payload)}`;
}

export async function summarizeImpl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const requestOrigin = event.headers?.origin;
  const allowList = (process.env.CORS_ORIGINS ?? "https://news.tonynagy.io")
    .split(",").map(s => s.trim()).filter(Boolean);
  const origin = requestOrigin && allowList.includes(requestOrigin) ? requestOrigin : (allowList[0] ?? "*");

  try {
    // Upstash (optional)
    const upstashUrl = optEnv("UPSTASH_REDIS_REST_URL");
    const upstashToken = optEnv("UPSTASH_REDIS_REST_TOKEN");
    const upstash = upstashUrl && upstashToken ? new UpstashClient(upstashUrl, upstashToken) : undefined;

    const parsed: SummarizeInput = event.body ? (JSON.parse(event.body) as SummarizeInput) : {};
    const lang = normalizeLang(parsed.lang);
    const maxItems = clamp(parsed.maxItems ?? 8, 1, 25);
    const mode: "fast" | "quality" = parsed.mode === "quality" ? "quality" : "fast";
    const styleInput = parsed.summaryStyle ?? "balanced";
    const style: SummaryStyle = (["balanced","headline-first","key-points","risks"] as const).includes(styleInput)
      ? styleInput : "balanced";

    const incoming = Array.isArray(parsed.items) ? parsed.items : [];
    if (incoming.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({
          ok: false,
          error: "No items provided. Pass 'items: NewsItem[]' from /search.",
          example: { items: [{ title: "Sample", url: "https://example.com", source: "Example", publishedAt: new Date().toISOString() }], lang: "en", maxItems: 5, summaryStyle: "key-points" }
        }),
      };
    }

    const items = compactItems(incoming, maxItems);

    if (items.length === 0) {
      // No usable items after normalization – FE should show this explicitly.
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({
          ok: false,
          error: "No usable items after normalization. Each item must include: title, url, source, publishedAt.",
          hint: "Ensure your /search response provides 'source' and ISO 'publishedAt' for every item.",
          receivedCount: Array.isArray(incoming) ? incoming.length : 0,
          example: {
            title: "Sample",
            url: "https://example.com",
            source: "Example",
            publishedAt: new Date().toISOString()
          }
        })
      };
    }

    // --- CACHE: try read (JSON) ---
    const cacheKey = makeSummCacheKey({ lang, maxItems, mode, style, items });
    if (upstash && !DISABLE_CACHE) {
      const cached = await upstash.get(cacheKey);
      if (cached) {
        const p = typeof cached === "string" ? JSON.parse(cached) : cached;
        p.blocks = Array.isArray(p.blocks) ? p.blocks : [];

        const hasSummary =
          typeof p.summaryText === "string" && p.summaryText.trim().length > 0;
        const hasBlocks = p.blocks.length > 0;

        if (hasSummary || hasBlocks) {
          return {
            statusCode: 200,
            headers: corsHeaders(origin),
            body: JSON.stringify({ ok: true, cached: true, ...p })
          };
        }
        // else: ignore stale/empty cache
      }
    }

    // Compute summary (LLM vs fallback)
    let summaryText: string | undefined;
    let blocks: SummaryJson["blocks"] | undefined;
    let header: string | undefined;
    let intro: string | undefined;
    let outro: string | undefined;

    if (mode === "quality") {
      try {
        const { system, user } = buildPromptJson(items, lang, style);
        const raw = await callOpenAI(system, user, "quality"); 

        const parsed = typeof raw === "string" ? JSON.parse(raw) as SummaryJson : (raw as SummaryJson);

        if (!parsed?.blocks?.length) throw new Error("No JSON blocks");

        // normalize minimal fields for FE
        blocks = parsed.blocks.map((b, i) => ({
          kind: b.kind,
          idx: b.idx ?? i + 1,
          title: b.title,
          url: b.url,
          source: b.source ?? undefined,
          date: b.date ?? undefined,
          facts: b.facts ?? undefined,
        }));
        header = parsed.header;
        intro = parsed.intro ?? undefined;
        outro = parsed.outro ?? undefined;

        // optional: also produce a plain text for backwards-compat (not required by FE if blocks used)
        summaryText = undefined;
      } catch (e) {
        if (process.env.DEBUG === "true") console.warn("quality-json-failed:", (e as Error).message);
        // hard fallback to our improved string builder
        summaryText = styleAwareFallback(items, lang, style);
      }
    } else {
      // fast mode
      summaryText = styleAwareFallback(items, lang, style);
    }

    const safeBlocks = normalizeBlocksForCache(blocks, style); 

    // Guarantee a non-empty summaryText if blocks are empty.
    const haveBlocks = Array.isArray(safeBlocks) && safeBlocks.length > 0;
    if (!haveBlocks) {
      const hasText = typeof summaryText === "string" && summaryText.trim().length > 0;
      if (!hasText) {
        // As a last resort, try deterministic fallback from the *original* incoming list,
        // so we don't lose potentially useful fields filtered out earlier.
        const fallbackBase = items.length > 0 ? items : compactItems(incoming, maxItems);
        summaryText = styleAwareFallback(fallbackBase, lang, style);

        // If that still fails (e.g., truly empty content), provide a minimal placeholder.
        if (!summaryText || summaryText.trim().length === 0) {
          summaryText = "No valid articles to summarize for the selected query.";
        }
      }
    }

    // summaryText or (header/intro/outro/blocks) …
    const payload: SummCachePayload = {
      mode,
      style,
      count: items.length,
      summaryText, 
      header,
      intro,
      outro,
      blocks: safeBlocks,      
      at: new Date().toISOString(),
    };

    // --- CACHE WRITE ONLY IF THERE IS CONTENT ---
    if (upstash && !DISABLE_CACHE) {
      const hasContent =
        (typeof payload.summaryText === "string" && payload.summaryText.trim().length > 0) ||
        (Array.isArray(payload.blocks) && payload.blocks.length > 0);
      if (hasContent) {
        await upstash.setex(cacheKey, JSON.stringify(payload), 300);
      }
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ ok: true, cached: false, ...payload }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { statusCode: 500, headers: corsHeaders(origin), body: JSON.stringify({ ok: false, error: msg }) };
  }
}

export const handler = requireToken(summarizeImpl);