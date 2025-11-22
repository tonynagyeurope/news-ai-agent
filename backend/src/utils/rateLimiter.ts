import { UpstashClient } from "./upstashClient.js";

export interface RateLimiterConfig {
  client: UpstashClient;
  prefix: string;     // e.g., "rl:summarize"
  windowSec: number;  // e.g., 60
  max: number;        // e.g., 2
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtUnixSec: number;
  current: number;
  key: string;
}

/**
 * Fixed window rate limiter using Redis INCR + EXPIRE.
 * - First hit sets EXPIRE.
 * - Subsequent hits only INCR; TTL is used to compute reset time.
 * Notes:
 * - Not perfectly fair at window boundaries (acceptable for demos).
 * - Single-command style (no pipeline) to match the existing Upstash GET client.
 */
export class RateLimiter {
  private readonly c: UpstashClient;
  private readonly prefix: string;
  private readonly windowSec: number;
  private readonly max: number;

  constructor(cfg: RateLimiterConfig) {
    this.c = cfg.client;
    this.prefix = cfg.prefix.replace(/:+$/, "");
    this.windowSec = cfg.windowSec;
    this.max = cfg.max;
  }

  private keyFor(ip: string): string {
    return `${this.prefix}:${ip}`;
  }

  private resetFromTtl(nowSec: number, ttlSec: number | null): number {
    return (ttlSec !== null && ttlSec > 0) ? nowSec + ttlSec : nowSec + this.windowSec;
  }

  async check(ip: string): Promise<RateLimitResult> {
    const key = this.keyFor(ip);
    const nowSec = Math.floor(Date.now() / 1000);

    // Increment hits
    const current = await this.c.incr(key);

    // If first hit, set expiry
    if (current === 1) {
      await this.c.expire(key, this.windowSec);
    }

    // Get TTL for accurate reset time (ignore errors gracefully)
    let ttl: number | null = null;
    try {
      ttl = await this.c.ttl(key);
    } catch {
      // noop → will approximate reset
    }

    const allowed = current <= this.max;
    const remaining = Math.max(0, this.max - current);
    const resetAtUnixSec = this.resetFromTtl(nowSec, ttl);

    return { allowed, remaining, resetAtUnixSec, current, key };
  }
}
