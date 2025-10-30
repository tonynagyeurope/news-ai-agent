// backend/src/core/llm/normalizeInterest.ts
import { OpenAI } from 'openai';

export interface NormalizedInterest { valid: boolean; topic: string; reason?: string; }

const system = `You are a strict topic validator. 
- Accept concise, real-world interests (1-3 words).
- Reject jokes, insults, empty inputs, and overly broad terms.
- Output strict JSON: { "valid": boolean, "topic": string, "reason"?: string }`;

export async function normalizeInterest(client: OpenAI, raw: string): Promise<NormalizedInterest> {
  const user = `Raw interest: "${raw}"\nRules: 1-3 words, recognizable domain (e.g., "golf", "k-pop", "machine learning").`;
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }
  });
  const json = JSON.parse(resp.choices[0].message.content ?? '{}') as NormalizedInterest;
  if (!json.topic) json.topic = raw.trim().toLowerCase();
  return json;
}
