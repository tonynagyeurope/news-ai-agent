// src/summarize/normalizeBlocks.ts
import type { SummaryStyle } from "@shared/types.js";
import type { CacheBlock, CacheBlockKind } from "./types.cache.js";

interface LooseBlock {
  kind?: string;
  idx?: number;
  title?: string;
  url?: string;
  source?: string;
  date?: string;
  facts?: string[];
}

function defaultKindForStyle(style: SummaryStyle): CacheBlockKind {
  switch (style) {
    case "headline-first": return "headline";
    case "key-points":     return "keyPoint";
    case "risks":          return "risk";
    default:               return "balanced";
  }
}

/** Ensure YYYY-MM-DD or drop. */
function normalizeDate(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeKind(raw: string | undefined, fallback: CacheBlockKind): CacheBlockKind {
  const k = (raw ?? "").toLowerCase();
  if (k === "headline" || k === "headline-first") return "headline";
  if (k === "keypoint" || k === "key-points" || k === "key_points") return "keyPoint";
  if (k === "risk" || k === "risks") return "risk";
  if (k === "balanced") return "balanced";
  return fallback;
}

/**
 * Convert a loose array of blocks into strict CacheBlock[].
 * - Drops entries without a valid URL.
 * - Fills idx/title/kind defaults.
 */
export function normalizeBlocksForCache(
  blocks: unknown,
  style: SummaryStyle
): CacheBlock[] | undefined {
  if (!Array.isArray(blocks)) return undefined;
  const fallbackKind = defaultKindForStyle(style);

  const out: CacheBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i] as LooseBlock;

    const url = (b.url ?? "").trim();
    if (!url) continue; // URL kötelező

    const title = (b.title ?? "Untitled").trim() || "Untitled";
    const idx = Number.isFinite(b.idx) && (b.idx as number) > 0 ? (b.idx as number) : (i + 1);
    const kind = normalizeKind(b.kind, fallbackKind);
    const source = b.source?.trim() || undefined;
    const date = normalizeDate(b.date);
    const facts = Array.isArray(b.facts) ? b.facts.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : undefined;

    out.push({ kind, idx, title, url, source, date, facts });
  }
  return out.length > 0 ? out : undefined;
}
