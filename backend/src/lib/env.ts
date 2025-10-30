// env.ts
import type { NewsProvider } from '@shared/types.js';
import { createHash } from 'crypto';

// Allow 'auto' only in the backend selector.
export type NewsProviderKind = NewsProvider | 'auto';

export function getNewsProvider(): NewsProviderKind {
  const k = (process.env.NEWS_PROVIDER ?? 'gnews') as NewsProviderKind;
  return k;
}

// ------------------------ Config helpers ------------------------

export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export function optEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function toInt(value: string | undefined, dflt: number): number {
  if (!value) return dflt;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : dflt;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

