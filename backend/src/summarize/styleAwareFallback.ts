// src/summarize/styleAwareFallback.ts
import { NewsItem, SummaryStyle } from "@shared/types.js";

/** Trim to ~N words for compact headline styles. */
function clampWords(input: string | undefined, maxWords: number): string {
  const text = input ?? "Untitled";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

/** YYYY-MM-DD from ISO; null if invalid/missing. */
function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function srcSuffix(src?: string): string {
  return src ? ` — ${src}` : "";
}

/** Headlines: short, no labels, only arrow + URL at the end. */
function formatHeadline(i: number, it: NewsItem): string {
  const title = clampWords(it.title, 12);
  return `[${i + 1}] ${title}${srcSuffix(it.source)} » ${it.url}`;
}

/** Key-points: emphasize date + source. */
function formatKeyPoint(i: number, it: NewsItem): string {
  const title = clampWords(it.title, 18);
  const date = shortDate(it.publishedAt);
  const meta = [it.source, date].filter(Boolean).join(" · ");
  return `[${i + 1}] ${title}${meta ? ` — ${meta}` : ""} » ${it.url}`;
}

/** Risks: visually distinct with a warning marker, fewer items. */
function formatRisk(i: number, it: NewsItem): string {
  const title = clampWords(it.title, 14);
  return `⚠︎ [${i + 1}] ${title}${srcSuffix(it.source)} » ${it.url}`;
}

/** Balanced: neutral list. */
function formatBalanced(i: number, it: NewsItem): string {
  const title = clampWords(it.title, 16);
  return `[${i + 1}] ${title}${srcSuffix(it.source)} » ${it.url}`;
}

export function styleAwareFallback(
  items: NewsItem[],
  lang: string,
  style: SummaryStyle
): string {
  const header = (() => {
    switch (style) {
      case "headline-first": return `Headlines digest (${lang}) — top ${items.length} item(s):`;
      case "key-points":     return `Key points (${lang}) — facts & dates across ${items.length} item(s):`;
      case "risks":          return `⚠ Risk scan (${lang}) — review of ${items.length} item(s):`;
      default:               return `Balanced summary (${lang}) — ${items.length} item(s):`;
    }
  })();

  const sliceCount = (() => {
    switch (style) {
      case "risks":          return Math.min(items.length, 6);
      case "headline-first": return Math.min(items.length, 8);
      case "key-points":     return Math.min(items.length, 8);
      default:               return Math.min(items.length, 10);
    }
  })();

  const picked = items.slice(0, sliceCount);

  const lines = picked.map((it, i) => {
    switch (style) {
      case "headline-first": return formatHeadline(i, it);
      case "key-points":     return formatKeyPoint(i, it);
      case "risks":          return formatRisk(i, it);
      default:               return formatBalanced(i, it);
    }
  });

  const outro = (() => {
    switch (style) {
      case "headline-first": return `— End of headlines —`;
      case "key-points":     return `— End of key points —`;
      case "risks":          return `— Risk scan complete —`;
      default:               return `— End of summary —`;
    }
  })();

  return `${header}\n\n${lines.join("\n")}\n\n${outro}`;
}
