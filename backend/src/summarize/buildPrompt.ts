// src/summarize/buildPrompt.ts
import { NewsItem, SummaryStyle } from "@shared/types.js";

// Helpers
function lineClamp(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input;
  return input.slice(0, maxLen - 1) + "…";
}

function bulletify(items: NewsItem[], limit: number): string {
  return items.slice(0, limit).map((it, i) => {
    const source = it.source ? ` — ${it.source}` : "";
    return `${i + 1}. ${lineClamp(it.title ?? "Untitled", 180)}${source}\n   ${it.url}`;
  }).join("\n");
}

export function buildPrompt(
  items: NewsItem[],
  lang: string,
  style: SummaryStyle
): { system: string; user: string } {
  const commonSystem =
`You are an expert news summarizer. Always be concise, non-repetitive, and faithful to sources.
- Do not invent facts.
- Use the requested style exactly.
- Keep output in ${lang}.
- Never include markdown code fences.`;

  const listForModel = bulletify(items, 25);

  // Style-specific guidance
  const styleBlocks: Record<SummaryStyle, { title: string; rules: string }> = {
    "balanced": {
      title: "Balanced digest",
      rules: `Write 3–5 short sentences covering the main themes across all items.
Include at most 1 notable quote (optional). End with a one-line takeaway.`
    },
    "headline-first": {
      title: "Headlines digest",
      rules: `List 5–8 ultra-concise headline-style bullets (max ~14 words each).
Each bullet should be self-contained and newsy. No commentary lines.`
    },
    "key-points": {
      title: "Key points",
      rules: `Produce 4–7 bullet points with concrete facts (numbers, names, dates).
Avoid repetition and adjectives. Each bullet must contain a distinct data point.`
    },
    "risks": {
      title: "Risks & uncertainties",
      rules: `Write 3–6 bullets focusing ONLY on risks, unknowns, controversies, or caveats.
If risk is low/unclear, call it out explicitly. Provide short rationale per bullet.`
    },
  };

  const s = styleBlocks[style];

  const user =
`${s.title} for a set of news items (language: ${lang}).

Rules:
${s.rules}

Items:
${listForModel}

Output format:
- Start with a single line heading: "${s.title} (${lang})"
- Then your bullets/sentences.
- For each item referenced, append a "Read more » <URL>" anchor line on its own ONLY if it adds value.
- Do NOT output markdown code blocks. No extra preambles.`;

  return { system: commonSystem, user };
}
