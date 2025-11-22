// ---------------------- Upstash REST client ----------------------

export class UpstashClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async ttl(key: string): Promise<number | null> {
    // Returns remaining time to live in seconds, or -2 if the key does not exist, -1 if it exists but has no associated expiration time.
    const out = (await this.call(`TTL/${encodeURIComponent(key)}`)) as { result?: number } | undefined;
    if (!out || typeof out.result !== "number") return null;
    // Normalize special values to null so callers can decide:
    // -2 (no key), -1 (no expiry) → null
    return out.result >= 0 ? out.result : null;
  }

  // GET <base>/<command>/<arg1>/<arg2>...
  private async call(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Upstash error ${res.status}: ${txt}`);
    }
    return res.json().catch(() => undefined);
  }

  async get(key: string): Promise<string | null> {
    const out = (await this.call(`GET/${encodeURIComponent(key)}`)) as { result?: string } | undefined;
    return out && typeof out.result === "string" ? out.result : null;
    // Note: When key not found, Upstash returns {"result":null}
  }

  async setex(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.call(`SETEX/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(value)}`);
  }

  async incr(key: string): Promise<number> {
    const out = (await this.call(`INCR/${encodeURIComponent(key)}`)) as { result?: number } | undefined;
    if (!out || typeof out.result !== "number") throw new Error("Upstash INCR invalid response");
    return out.result;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.call(`EXPIRE/${encodeURIComponent(key)}/${ttlSeconds}`);
  }
}
