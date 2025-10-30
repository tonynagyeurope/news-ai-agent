// src/summarize/types.cache.ts
import type { SummaryStyle } from "@shared/types.js";

export type CacheBlockKind = "headline" | "keyPoint" | "risk" | "balanced";

export interface CacheBlock {
  kind: CacheBlockKind;
  idx: number;       // 1-based index
  title: string;
  url: string;       // must be non-empty
  source?: string;
  date?: string;     // YYYY-MM-DD
  facts?: string[];  // only for keyPoint, but allowed empty
}

export interface SummCachePayload {
  mode: "fast" | "quality";
  style: SummaryStyle;
  count: number;
  summaryText?: string;
  header?: string;
  intro?: string;
  outro?: string;
  blocks?: CacheBlock[];   // strict, ha van
  at: string;              // ISO timestamp
}
