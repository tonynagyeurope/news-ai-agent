// lib/api.ts

import { isHttpErrorLike, RateLimitError, parseRetryAfterSeconds } from "@shared/httpErrors";
import { SummarizeResp, SummaryBlock } from "@shared/summary.types";
import { SearchNewsResp } from "shared_local/types";
import { normalizeBlock } from "./utils/normalizeBlock";

const BASE = process.env.NEXT_PUBLIC_NEWS_AI_BASE!;
const TOKEN = process.env.NEXT_PUBLIC_INTERNAL_TOKEN!;

export class HttpError extends Error {
  public readonly status: number;
  public readonly headers: Headers;
  public readonly bodyText: string;

  constructor(status: number, headers: Headers, bodyText: string) {
    super(`HTTP_${status}`);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
    this.bodyText = bodyText;
  }
}

// Builds absolute URL if a relative path is passed
function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = BASE?.replace(/\/+$/, "") ?? "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function httpPost<T>(
  path: string,
  body?: unknown,
  init?: { signal?: AbortSignal }
): Promise<T> {
  const url = buildUrl(path);

  // Merge headers and include internal token if present
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (TOKEN && TOKEN.trim().length > 0) {
    headers["x-internal-token"] = TOKEN;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: init?.signal,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new HttpError(res.status, res.headers, txt);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function searchNews(
  q: string,
  lang: string,
  maxItems: number
): Promise<SearchNewsResp> {
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
  let raw: Partial<SummarizeResp>;

  try {
    raw = await httpPost<Partial<SummarizeResp>>("/api/news/summarize", payload);
  } catch (e: unknown) {
    // Map HTTP 429 → cooldown with Retry-After seconds
    if (isHttpErrorLike(e) && e.status === 429) {
      const secs = parseRetryAfterSeconds(e.headers) ?? 60;
      throw new RateLimitError("Too Many Requests", secs);
    }
    // Compact error message (status + short body preview)
    const bodyShort =
      isHttpErrorLike(e) && typeof e.bodyText === "string"
        ? e.bodyText.slice(0, 200)
        : "";
    const statusPart =
      isHttpErrorLike(e) && typeof e.status === "number" ? `HTTP_${e.status}` : "HTTP_ERROR";
    const msg = bodyShort.length > 0 ? `${statusPart}: ${bodyShort}` : statusPart;
    throw new Error(msg);
  }

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
    summaryText: typeof raw.summaryText === "string" ? raw.summaryText : undefined,
  };

  const hasText = typeof resp.summaryText === "string" && resp.summaryText.trim().length > 0;
  const hasBlocks = Array.isArray(resp.blocks) && resp.blocks.length > 0;
  if (!hasText && !hasBlocks) {
    throw new Error("Empty summarize payload (no blocks or summaryText).");
  }

  return resp;
}

export { isHttpErrorLike };
