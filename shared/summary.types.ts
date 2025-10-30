// @shared/summary.types.ts
import type { SummaryStyle } from "./types.js";

export type BlockKind = "headline" | "keyPoint" | "risk" | "balanced";

export interface SummaryBlock {
  kind?: BlockKind;
  idx?: number;
  title?: string;        // concise rewrite, NOT verbatim copy
  url?: string;
  source?: string;
  date?: string;        // YYYY-MM-DD if known
  facts?: string[];     // only for keyPoint
}

export interface SummaryJson {
  ok: true;
  style: SummaryStyle;
  lang: string;
  header: string;       // 1-line heading
  intro?: string;       // optional preface (e.g., "Top sources: …" or "Low apparent risk")
  outro?: string;
  blocks: SummaryBlock[]; // 3–10 items depending on style
}

export interface SummarizeResp {
  ok: boolean;
  cached?: boolean;
  count: number;
  mode: "fast" | "quality";
  style: "balanced" | "headline-first" | "key-points" | "risks";
  at: string;              // ISO timestamp
  // New structured fields (prefer to render these):
  header?: string;
  intro?: string;
  outro?: string;
  blocks?: SummaryBlock[];
  summaryText?: string;
}
