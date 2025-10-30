'use client';

import { useMemo, useState } from 'react';
import { NewsItem, SummaryStyle } from "@shared/types.js";
import { SummarizeResp } from "@shared/summary.types.js";
import { searchNews, summarizeNews } from '../../lib/api.js';
import { ArticleCard } from './_components/ArticleCard.js';
import type { SummaryBlock } from "@shared/summary.types.js";
import { formatSummaryToHtml } from "@lib/utils/summaryFormat.js";
import { ClipboardIcon, CheckIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const LANG = 'en';

/** Basic topic validator with light-hearted feedback */
function validateTopic(input: string): { ok: boolean; reason?: string } {
  const q = input.trim();

  // Length & basic guards
  if (q.length < 2) {
    return { ok: false, reason: "Too short. Try a concise topic, e.g. 'AI safety'." };
  }
  if (q.length > 80) {
    return { ok: false, reason: "Way too long for a topic. Keep it short and specific." };
  }

  // Reject URLs or obvious domains
  const looksLikeUrl = /^https?:\/\//i.test(q) || /\.[a-z]{2,}($|\/|\?)/i.test(q);
  if (looksLikeUrl) {
    return { ok: false, reason: "Looks like a URL. Enter a topic instead, e.g. 'banana supply chain'." };
  }

  // Reject emojis / unusual symbols
  const emojiOrWeird = /[\u{1F300}-\u{1FAFF}]/u.test(q) || /[^\p{L}\p{N}\s\-\.,&'()]/u.test(q);
  if (emojiOrWeird) {
    return { ok: false, reason: "Let's keep it plain text (no emojis/symbols) for the topic. 🙂" };
  }

  // Sentence / personal-statement detector (looks like a sentence rather than a topic)
  const hasSentenceEnd = /[.?!]$/.test(q);
  const hasPronoun = /\b(i|my|me|we|our|you|your|he|she|they|them)\b/i.test(q);
  const hasBeVerb = /\b(is|are|am|was|were|be|being|been|have|has|do|does)\b/i.test(q);
  if ((hasPronoun && hasBeVerb) || hasSentenceEnd) {
    return {
      ok: false,
      reason:
        "That looks like a sentence. Please enter a topic/subject, e.g. 'bananas health benefits', 'global banana prices 2025', or 'UAE food imports'.",
    };
  }

  // Low-signal tokens only?
  const stopWords = new Set(["the","a","an","and","or","news","latest","stuff","things","topic","what","why"]);
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const meaningfulCount = tokens.filter(t => !stopWords.has(t)).length;
  if (meaningfulCount === 0) {
    return { ok: false, reason: "That's mostly filler words. Add something specific (e.g. 'OpenAI policy changes')." };
  }

  return { ok: true };
}

function useDebug(): boolean {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_DEBUG === '1';
  const q = new URLSearchParams(window.location.search);
  return q.get('debug') === '1' || process.env.NEXT_PUBLIC_DEBUG === '1';
}

// ---- helper: parse stub-style summary into intro + bullets ----
function parseStubSummary(raw: string): {
  intro?: string;
  bullets?: Array<{ idx?: number; title: string; url?: string }>;
} {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  const intro = lines[0]; // e.g., "Stub summary (en) for 8 item(s):"
  const bullets: Array<{ idx?: number; title: string; url?: string }> = [];

  // Expect pattern: "- [n] Title (http...)"
  const re = /^-\s*\[(\d+)\]\s*(.+?)\s*\((https?:\/\/[^\s)]+)\)\s*$/i;
  const reNoIdx = /^-\s*(.+?)\s*\((https?:\/\/[^\s)]+)\)\s*$/i;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    let m = re.exec(line);
    if (m) {
      bullets.push({ idx: Number(m[1]), title: m[2], url: m[3] });
      continue;
    }
    m = reNoIdx.exec(line);
    if (m) {
      bullets.push({ title: m[1], url: m[2] });
      continue;
    }
    // fallback: plain line as title
    if (line.startsWith('- ')) bullets.push({ title: line.slice(2) });
  }
  return { intro, bullets: bullets.length ? bullets : undefined };
}

export default function NewsAiAgentPage() {
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('en');
  const [maxItems, setMaxItems] = useState(6);
  const [style, setStyle] = useState<SummaryStyle>('balanced');
  const [mode, setMode] = useState<'fast' | 'quality'>('quality');

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [summary, setSummary] = useState('');
  const [blocks, setBlocks] = useState<SummaryBlock[]>([])
  const [provider, setProvider] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const debug = useDebug();
  const [header, setHeader] = useState<string | null>(null);
  const [intro, setIntro] = useState<string | null>(null);
  const [outro, setOutro] = useState<string | null>(null);  

  const [tSearch, setTSearch] = useState<number | null>(null);
  const [tSumm, setTSumm] = useState<number | null>(null);
  const [wasCached, setWasCached] = useState<boolean>(false);
  const [fellBackToFast, setFellBackToFast] = useState<boolean>(false);

  const canRun = useMemo(() => q.trim().length >= 2 && !loading, [q, loading]);

  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text =
      blocks.length > 0
        ? blocks.map(b => `- ${b.title}${b.url ? ` (${b.url})` : ""}`).join("\n")
        : summary;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    const content =
      blocks.length > 0
        ? blocks.map(b => `- ${b.title}${b.url ? ` (${b.url})` : ""}`).join("\n")
        : summary;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `news-summary-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRun(): Promise<void> {
    setError('');
    setFellBackToFast(false);
    setWasCached(false);
    setTSearch(null);
    setTSumm(null);
    const v = validateTopic(q);
    if (!v.ok) {
      // Light-hearted, but actionable validation feedback
      setError(v.reason ?? "This topic needs a tiny tweak.");
      return;
    }

    setLoading(true);
    setSummary('');
    try {
      // 1) Search
      const t0 = performance.now();
      const s = await searchNews(q, LANG, maxItems);
      const t1 = performance.now();
      setTSearch(Math.round(t1 - t0));

      setItems(s.items);
      setProvider(s.provider ?? "unknown");
      setAt(s.at ?? null);

      if (!s.items || s.items.length === 0) {
        setError("No relevant articles found for this topic. Try a more specific subject (e.g. 'IT jobs in the US', 'NHL playoffs 2025', 'UAE food imports').");
        setBlocks([]);         
        setSummary("");
        setLoading(false);
        return;
      }      


      // 2) Summarize timing
      const t2 = performance.now();
      let resp: SummarizeResp | null = null;
      try {
        resp = await summarizeNews({
          lang: LANG,
          mode,                 // "fast" | "quality"
          summaryStyle: style,  // "balanced" | "headline-first" | "key-points" | "risks"
          items: s.items,
          maxItems
        });
      } catch (err) {
        // Quality failed? Try fast as an automatic fallback.
        if (mode === 'quality') {
          try {
            const respFast = await summarizeNews({
              lang: LANG,
              mode: 'fast',
              summaryStyle: style,
              items: s.items,
              maxItems
            });
            resp = respFast;
            setFellBackToFast(true);
          } catch (err2) {
            throw err2;
          }
        } else {
          throw err;
        }
      }
      const t3 = performance.now();
      setTSumm(Math.round(t3 - t2));

      if (!resp) throw new Error("No summarize response.");

      setWasCached(Boolean(resp.cached));
      setHeader(resp.header ?? null);
      setIntro(resp.intro ?? null);
      setOutro(resp.outro ?? null);
      setBlocks(resp.blocks ?? []);
      setSummary(resp.summaryText ?? "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/No usable items/i.test(msg)) {
        setError("The news source returned items without required fields. Please try a different topic or broaden the query.");
      } else if (/No relevant articles/i.test(msg) || /No items provided/i.test(msg)) {
        setError("No relevant articles found. Refine your topic and try again.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">News AI Agent</h1>      
            <div className="mx-auto max-w-4xl px-4 py-4 text-center">
              <p className="text-gray-600 text-base md:text-lg leading-relaxed">
                <span className="font-semibold text-gray-900">AI Integration</span> — a fully&nbsp;serverless demo that turns user intent into{" "}
                <span className="font-semibold">automated AI actions</span>: topic understanding, news retrieval, and&nbsp;LLM-based summarization.
              </p>
            </div>
        </div>

        {/* GitHub badge */}
        <a
          href="https://github.com/tonynagyeurope/news-ai-agent"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
          aria-label="View source on GitHub"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4"><path fill="currentColor" d="M8 0C3.58 0 0 3.64 0 8.13c0 3.6 2.29 6.64 5.47 7.73.4.08.55-.18.55-.39 0-.19-.01-.82-.01-1.49-2  .37-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87 .87 2.33.66.07-.53.28-.87.5-1.07-1.78-.2-3.64-.91-3.64 -4.02 0-.89.31-1.61.82-2.18-.08-.2-.36-1.01.08-2.1 0 0 .67-.22 2.2.83.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.05 2.2-.83 2.2-.83.44 1.09.16 1.9.08 2.1.51.57.82 1.29.82 2.18 0 3.12-1.87 3.82-3.65 4.02.29.25.54.73.54 1.48 0 1.07-.01 1.94-.01 2.2 0 .21.15.47.55.39A8.006 8.006 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z"/></svg>
          <span>View source</span>
        </a>        
      </div>

      {/* Form */}
      <div className="mt-6 rounded-2xl border p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Topic + Examples (wide left) */}
          <div className="md:col-span-7">
            <label className="block text-sm font-medium mb-1">Topic</label>
            <input
              className="w-full h-[42px] rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="e.g. 'US football'"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "OpenAI policy changes",
                "Ethereum ETF approval news",
                "UAE tech startup funding 2025"
              ].map(example => (
                <button
                  key={example}
                  type="button"
                  onClick={() => { setQ(example); }}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50"
                >
                  {example}
                </button>
              ))}
              <button
                type="button"
                onClick={handleRun}
                className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50"
              >
                Run last topic
              </button>
            </div>
          </div>

          {/* Middle stack: Max items + Mode (narrow, vertical) */}
          <div className="md:col-span-2 flex flex-col gap-4 md:items-start">
            <div>
              <label className="block text-sm font-medium mb-1">Max items</label>
              <input
                type="number"
                min={1}
                max={25}
                className="w-full md:w-32 h-[42px] rounded-xl border px-3 py-2"
                value={maxItems}
                onChange={e => setMaxItems(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mode</label>
              <select
                className="w-full md:w-32 h-[42px] rounded-xl border px-3 py-2"
                value={mode}
                onChange={e => setMode(e.target.value as 'fast' | 'quality')}
              >
                <option value="quality">Quality</option>
                <option value="fast">Fast</option>
              </select>
            </div>
          </div>

          {/* Right column: Summary style on top, Run button below (compact) */}
          <div className="md:col-span-3 flex flex-col justify-between">
            {/* Summary style (above the Run button) */}
            <div>
              <label className="block text-sm font-medium mb-1">Summary style</label>
              <select
                className="w-full h-[42px] rounded-xl border px-3 py-2"
                value={style}
                onChange={e => setStyle(e.target.value as SummaryStyle)}
              >
                <option value="balanced">Balanced</option>
                <option value="headline-first">Headline first</option>
                <option value="key-points">Key points</option>
                <option value="risks">Risks & implications</option>
              </select>
            </div>

            {/* Run */}
            <div className="mt-4">
              <button
                onClick={handleRun}
                disabled={!canRun}
                className="w-full h-[42px] rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              >
                {loading ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Debug-only source info (hidden by default) */}
      {debug && provider && (
        <div className="mt-2 text-xs text-gray-500">
          Source: <span className="font-medium">{provider}</span>
          {at && (
            <>
              {" · "}
              <span className="text-slate-600">Updated: {new Date(at).toLocaleString()}</span>
            </>
          )}
        </div>
      )}

      {/* Summary */}
      <AnimatePresence mode="wait">
        {(blocks.length > 0 || (summary && summary.trim().length > 0)) && (
          <motion.div
            key={`summary-${blocks.length}-${summary?.length ?? 0}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="mt-8 mb-10"
          >
            <div className="mt-8 mb-10">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 md:p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  Summary
                  <span className="rounded-full border px-2 py-0.5 text-xs text-gray-600">Style: {style}</span>
                  <span className="rounded-full border px-2 py-0.5 text-xs text-gray-600">Mode: {mode}</span>
                  {wasCached && <span className="rounded-full border px-2 py-0.5 text-xs text-emerald-700">cached</span>}
                  {fellBackToFast && <span className="rounded-full border px-2 py-0.5 text-xs text-amber-700">fallback→fast</span>}
                  {tSearch != null && <span className="rounded-full border px-2 py-0.5 text-xs text-gray-600">search: {tSearch} ms</span>}
                  {tSumm != null && <span className="rounded-full border px-2 py-0.5 text-xs text-gray-600">summarize: {tSumm} ms</span>}
                </h2>

                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <ClipboardIcon className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>   

                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  <span>Download</span>
                </button>                     

                {blocks.length > 0 ? (
                  <>
                    {header && <p className="text-sm text-gray-700 mb-2">{header}</p>}
                    {intro && <p className="text-xs text-gray-600 mb-3">{intro}</p>}
                    <ul className="space-y-3">
                      {blocks.map((b, i) => (
                        <li key={`${b.idx ?? i}-${b.url ?? b.title ?? "nourl"}`} className="text-sm leading-relaxed text-gray-800">
                          {b.kind === "risk" ? <span className="mr-1">⚠︎</span> : null}
                          <span className="font-medium">[{b.idx ?? i + 1}] {b.title ?? "Untitled"}</span>{" "}
                          {b.url ? (
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center underline underline-offset-4 hover:no-underline"
                            >
                              Read more »
                            </a>
                          ) : null}
                          {(b.kind === "keyPoint" && b.facts?.length) ? (
                            <span className="ml-2 text-xs text-gray-600">({b.facts.join(" • ")})</span>
                          ) : null}
                          {(b.source || b.date) ? (
                            <span className="ml-2 text-xs text-gray-500">
                              {b.source ?? ""}{b.source && b.date ? " · " : ""}{b.date ?? ""}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {outro && <p className="text-xs text-gray-600 mt-3">{outro}</p>}
                  </>
                ) : (
                  // plain-text fallback
                  <div
                    className="prose max-w-none text-sm leading-6"
                    dangerouslySetInnerHTML={{ __html: formatSummaryToHtml(summary) }}
                  />
                )}
              </div>          
            </div>
          </motion.div>                            
        )}
      </AnimatePresence>      

      {/* Loading state */}
      {loading && (
        <div className="mt-8 flex items-center gap-3 text-sm text-gray-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
          Fetching articles & composing summary…
        </div>
      )}

      {/* Articles */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.section
            key={`articles-${items.length}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="mt-8"
          >
            <h2 className="text-lg font-semibold mb-3">Articles</h2>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
              {items.map((it) => (
                <motion.div
                  key={it.url}
                  variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.22 }}
                >
                  <ArticleCard item={it} />
                </motion.div>
              ))}
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>

      <footer className="mt-12 py-6 text-center text-xs text-gray-500 border-t">
        Built with Next.js · AWS Lambda · OpenAI API — by <a className="underline hover:no-underline" href="https://www.tonynagy.io" target="_blank" rel="noreferrer">Tony Nagy</a>
      </footer>    
    </div>
  );
}
