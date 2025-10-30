// lib/api.ts

import { SummarizeResp, SummaryBlock } from "@shared/summary.types.js";
import { SearchNewsResp } from "@shared/types.js";
import { normalizeBlock } from "./utils/normalizeBlock.js";

const BASE = process.env.NEXT_PUBLIC_NEWS_AI_BASE!;
const TOKEN = process.env.NEXT_PUBLIC_INTERNAL_TOKEN!;

type HttpPost = <TReq extends object, TRes>(
  url: string,
  body: TReq
) => Promise<TRes>;

async function httpPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function searchNews(
  q: string,
  lang: string,
  maxItems: number
): Promise<SearchNewsResp> {
  // Ha a backend "maxItems"-et vár:
  const raw = await httpPost<Partial<SearchNewsResp>>("/api/news/search", {
    q,
    lang,
    maxItems,
  });

  return {
    ok: raw.ok ?? true,
    items: Array.isArray(raw.items) ? raw.items : [],
    provider: raw.provider ?? "unknown",
    at: raw.at ?? null,
    tookMs: typeof raw.tookMs === "number" ? raw.tookMs : undefined,
    cached: Boolean(raw.cached),
  };
}

export async function summarizeNews(payload: {
  lang: string;
  mode: "fast" | "quality";
  summaryStyle: "balanced" | "headline-first" | "key-points" | "risks";
  items: Array<{ title: string; url: string; source?: string; publishedAt?: string }>;
  maxItems?: number;
}): Promise<SummarizeResp> {
  // The backend expects POST JSON
  const raw = await httpPost<Partial<SummarizeResp>>("/api/news/summarize", payload);

  const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  const blocks: SummaryBlock[] = rawBlocks.map((b, i) => normalizeBlock(b as Record<string, unknown>, i));


  const resp: SummarizeResp = {
    ok: raw.ok ?? true,
    cached: Boolean(raw.cached),
    count: typeof raw.count === "number" ? raw.count : (blocks.length || payload.items.length),
    mode: (raw.mode as "fast" | "quality") ?? payload.mode,
    style: (raw.style as SummarizeResp["style"]) ?? payload.summaryStyle,
    at: raw.at ?? new Date().toISOString(),
    header: raw.header,
    intro: raw.intro,
    outro: raw.outro,
    blocks,                                      
    summaryText: typeof raw.summaryText === "string"
      ? raw.summaryText
      : undefined
  };

  const hasText = typeof resp.summaryText === "string" && resp.summaryText.trim().length > 0;
  const hasBlocks = Array.isArray(resp.blocks) && resp.blocks.length > 0;
  if (!hasText && !hasBlocks) {
    throw new Error("Empty summarize payload (no blocks or summaryText).");
  }

  return resp;
 }
