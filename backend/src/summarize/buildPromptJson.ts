// src/summarize/buildPromptJson.ts
import { NewsItem, SummaryStyle } from "@shared/types.js";
import { SummaryJson } from "@shared/summary.types.js";

function shortDate(iso?: string): string | undefined {
  if (!iso) return;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function materializeForModel(items: NewsItem[]): string {
  // Give the model compact, structured context
  // We DO include URLs so it can pick which to reference.
  return items
    .map((it, i) => {
      const date = shortDate(it.publishedAt);
      const src = it.source ?? "";
      return `${i + 1}. title="${it.title ?? "Untitled"}" src="${src}" date="${date ?? ""}" url="${it.url ?? ""}"`;
    })
    .join("\n");
}

export function buildPromptJson(items: NewsItem[], lang: string, style: SummaryStyle): {
  system: string;
  user: string;
  expectJson: true; // hint for caller
} {
  const schemaBrief = `
Return a strict JSON object with this shape:
{
  "ok": true,
  "style": "${style}",
  "lang": "${lang}",
  "header": string,
  "intro": string | null,
  "outro": string | null,
  "blocks": Array<{
    "kind": "headline" | "keyPoint" | "risk" | "balanced",
    "idx": number,          // 1-based
    "title": string,        // concise rewrite, not verbatim; <= 14 words for headlines, <= 18 for others
    "url": string,
    "source": string | null,
    "date": string | null,  // YYYY-MM-DD if known
    "facts": string[] | null // ONLY for keyPoint (numbers, %s, "Week 10", years...), max 2 items
  }>
}
No extra keys. No markdown.`;

  const styleRules = (() => {
    switch (style) {
      case "headline-first": return `
STYLE: Headlines.
- 5–8 bullets, ultra-concise, newsy.
- Do NOT include commentary sentences.
- Max 1 item per domain if possible (prefer diverse sources).
- NO "Read more" text.`;
      case "key-points": return `
STYLE: Key points.
- 4–7 bullets, each must contain a concrete fact (number, %, date, "Week 10", year, etc.).
- Populate "facts" with up to 2 tokens extracted from the bullet's content.
- Keep blocks factual; avoid adjectives.`;
      case "risks": return `
STYLE: Risks & uncertainties.
- 3–6 bullets ONLY if risk-/uncertainty-related.
- If very few items contain risk signals, set "intro" to "Low apparent risk in this set." and still output 3–4 most relevant.
- Title should hint the risk (ban, probe, outage, lawsuit, betting scandal, etc.).`;
      default: return `
STYLE: Balanced.
- 5–9 bullets mixed; include (source | date) in metadata but keep titles concise.
- "intro" may include "Top sources: X ×2, Y ×1".`;
    }
  })();

  const antiCopy = `
Important:
- Do NOT copy headlines verbatim; lightly rewrite them to be concise.
- Keep output language: ${lang}.
- Every block MUST include a valid "url".
- Never include "Read more" text; links are represented by the "url" field only.`;

  const system =
`You are a precise, style-aware news summarizer that returns STRICT JSON only.
Follow the schema exactly. Refuse to output markdown or free text.`;

  const user =
`${schemaBrief}
${styleRules}
${antiCopy}

Here are the items:
${materializeForModel(items)}

Now produce the JSON object.`;

  return { system, user, expectJson: true as const };
}
