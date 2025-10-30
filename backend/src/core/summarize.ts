// backend/src/core/summarize.ts
// All comments must be in English.

import OpenAI from 'openai';
import { openai, resolveModel } from '../lib/openai.js';
import type { NewsArticle, SummarizedArticle, Sentiment } from '@shared/types.js';

/** JSON shape expected from the model. */
interface SummarizeJson {
  summary: string;
  sentiment: Sentiment;
  entities: string[];
}

/** System prompt kept concise to reduce tokens and improve determinism. */
const SYSTEM_PROMPT = `You are a concise news summarizer.
- Produce a factual, neutral summary in 50-70 words.
- Also return "sentiment" as one of "positive" | "neutral" | "negative".
- Also return up to 5 key "entities" (strings).
- If only the title/description is available, prefix the summary with "Preview: ".
- Output strict JSON only: {"summary": string, "sentiment": "...", "entities": string[]}.`;

/** Safely parses a JSON string coming from the model. */
function safeParseJson(input: string | null | undefined): SummarizeJson {
  try {
    const parsed = JSON.parse(input ?? '{}') as Partial<SummarizeJson>;
    return {
      summary: parsed.summary ?? '',
      sentiment: (parsed.sentiment ?? 'neutral') as Sentiment,
      entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 5) : []
    };
  } catch {
    return { summary: '', sentiment: 'neutral', entities: [] };
  }
}

/**
 * Summarizes a single news article with the LLM.
 * Use 'quality' profile by default for better coherence.
 */
export async function summarizeOne(
  client: OpenAI,
  topic: string,
  article: NewsArticle,
  profile: 'fast' | 'quality' = 'quality'
): Promise<SummarizedArticle> {
  const model = resolveModel(profile);

  const userPrompt =
    `Topic: ${topic}\n` +
    `Title: ${article.title}\n` +
    `Description: ${article.description ?? 'N/A'}`;

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' }
  });

  const parsed = safeParseJson(resp.choices[0]?.message?.content);
  return {
    ...article,
    summary: parsed.summary,
    sentiment: parsed.sentiment,
    entities: parsed.entities
  };
}

/**
 * Summarizes a list of articles with small concurrency to control cost/latency.
 * Defaults: quality model, concurrency=3.
 */
export async function summarizeBatch(
  topic: string,
  articles: NewsArticle[],
  opts?: { profile?: 'fast' | 'quality'; concurrency?: number }
): Promise<SummarizedArticle[]> {
  const client = openai();
  const profile = opts?.profile ?? 'quality';
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 3, 8));

  // Simple concurrency pool without extra deps
  const results: SummarizedArticle[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < articles.length) {
      const current = index++;
      const a = articles[current];
      const out = await summarizeOne(client, topic, a, profile);
      results[current] = out;
    }
  }

  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, articles.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
