// Egységesíts bármilyen bejövő "block"-ot a renderhez.
// Próbálkozunk gyakori aliasokkal: index/id, link/href, text/headline, factTokens, stb.

import type { SummaryBlock } from "@shared/summary.types";

type AnyObj = Record<string, unknown>;

export function normalizeBlock(b: AnyObj, i: number): SummaryBlock {
  const getStr = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = b[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };
  const getNum = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = b[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
    return undefined;
  };
  const getArrStr = (...keys: string[]): string[] | undefined => {
    for (const k of keys) {
      const v = b[k];
      if (Array.isArray(v)) {
        const out = v.filter((x) => typeof x === "string").map((x) => x.trim());
        if (out.length > 0) return out;
      }
    }
    return undefined;
  };

  const idx = getNum("idx", "index", "id") ?? (i + 1);
  const title = getStr("title", "text", "headline", "summary") ?? "Untitled";
  const url = getStr("url", "link", "href");
  const kindRaw = getStr("kind", "type", "style");
  const kind = ((): SummaryBlock["kind"] => {
    switch ((kindRaw ?? "").toLowerCase()) {
      case "headline":
      case "headline-first":
        return "headline";
      case "keypoint":
      case "key-points":
      case "key_points":
        return "keyPoint";
      case "risk":
      case "risks":
        return "risk";
      case "balanced":
        return "balanced";
      default:
        return undefined;
    }
  })();
  const source = getStr("source", "src", "origin", "publisher", "domain");
  const date = getStr("date", "publishedAt", "published_at");
  const facts = getArrStr("facts", "factTokens", "tokens");

  return { idx, title, url, kind, source, date, facts };
}
