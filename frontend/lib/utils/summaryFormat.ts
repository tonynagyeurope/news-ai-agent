// lib/utils/summaryFormat.ts
// Purpose: turn plain-text summary into HTML with ONE clean "Read more »" anchor per line.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Normalize a text line to HTML:
 * - If it contains "... [label] » URL" or "... » URL" or "... Read more » URL", render exactly one anchor.
 * - Keep any label text (e.g., "Risk context") before the anchor, but do NOT duplicate "Read more »".
 */
function renderLineToHtml(line: string): string {
  const raw = line;

  // Already an anchor? (defensive) → just escape the rest
  if (raw.includes("<a ") && raw.includes("</a>")) {
    return raw;
  }

  // Trim but keep internal spaces
  const lineTrimmed = raw.replace(/\s+$/g, "");

  // Pattern 1: "... Read more » URL"
  const pReadMore = /^(.*?)(?:\s*[-—]\s*)?(?:Read more\s*»)\s*(https?:\/\/\S+)(.*)$/i;

  // Pattern 2: "... <label> » URL"  (e.g., "Risk context » URL")
  const pLabeled = /^(.*?)(?:\s*[-—]\s*)?([A-Za-z][^»]{0,80}?)\s*»\s*(https?:\/\/\S+)(.*)$/;

  // Pattern 3: "... » URL" (no label)
  const pArrowOnly = /^(.*?)(?:\s*[-—]\s*)?»\s*(https?:\/\/\S+)(.*)$/;

  // Try labeled (but not the "Read more" special-case)
  const m2 = lineTrimmed.match(pLabeled);
  if (m2 && !/^\s*Read more\s*$/i.test(m2[2].trim())) {
    const pre = escapeHtml(m2[1] ?? "");
    const label = escapeHtml(m2[2].trim());
    const url = m2[3];
    const post = escapeHtml(m2[4] ?? "");
    return `${pre}${pre ? " " : ""}${label} — <a href="${url}" target="_blank" rel="noopener noreferrer">Read more »</a>${post}`;
  }

  // Try explicit "Read more » URL"
  const m1 = lineTrimmed.match(pReadMore);
  if (m1) {
    const pre = escapeHtml(m1[1] ?? "");
    const url = m1[2];
    const post = escapeHtml(m1[3] ?? "");
    return `${pre}${pre ? " — " : ""}<a href="${url}" target="_blank" rel="noopener noreferrer">Read more »</a>${post}`;
  }

  // Try arrow-only "» URL"
  const m3 = lineTrimmed.match(pArrowOnly);
  if (m3) {
    const pre = escapeHtml(m3[1] ?? "");
    const url = m3[2];
    const post = escapeHtml(m3[3] ?? "");
    return `${pre}${pre ? " — " : ""}<a href="${url}" target="_blank" rel="noopener noreferrer">Read more »</a>${post}`;
  }

  // Fallback: auto-link any raw URLs
  const escaped = escapeHtml(lineTrimmed);
  return escaped.replace(
    /(https?:\/\/\S+)/g,
    `<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>`
  );
}

export function formatSummaryToHtml(input: string): string {
  return input
    .split("\n")
    .map((ln) => `<span>${renderLineToHtml(ln)}</span>`)
    .join("<br/>");
}
