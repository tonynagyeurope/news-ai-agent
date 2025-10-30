// openai.ts
import OpenAI from 'openai';

type ModelProfile = 'fast' | 'quality';

const MODEL_FAST = process.env.OPENAI_MODEL_FAST ?? 'gpt-5-nano';
const MODEL_QUALITY = process.env.OPENAI_MODEL_QUALITY ?? 'gpt-5-mini';

export function resolveModel(profile: ModelProfile): string {
  return profile === 'fast' ? MODEL_FAST : MODEL_QUALITY;
}

export function openai(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  return new OpenAI({ apiKey: key });
}
