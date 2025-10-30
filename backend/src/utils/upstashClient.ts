// ---------------------- Upstash REST client ----------------------

export class UpstashClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
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
