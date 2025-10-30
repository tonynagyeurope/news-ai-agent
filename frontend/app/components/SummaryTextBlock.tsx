// app/components/SummaryBlock.tsx
"use client";

import { useMemo } from "react";
import { formatSummaryToHtml } from "@lib/utils/summaryFormat.js";

interface Props {
  text: string;
}

/** Renders the LLM/fallback summary string as HTML with readable anchors. */
export default function SummaryBlock({ text }: Props) {
  // Memoize so we don't re-run the formatter on every render
  const html = useMemo(() => formatSummaryToHtml(text), [text]);

  return (
    <div
      className="prose max-w-none text-sm leading-6"
      // We produce sanitized HTML ourselves (no user HTML is accepted),
      // only URLs are turned into <a> with noopener+noreferrer.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
