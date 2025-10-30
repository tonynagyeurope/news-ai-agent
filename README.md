# News AI Agent

**A fully serverless demo that turns user intent into automated AI actions.**
It retrieves real-time news from public APIs, summarizes them using LLM reasoning,
and presents concise, human-style briefings — all running on AWS Lambda + OpenAI.

## Live Demo

https://news.tonynagy.io  
(Deployed via S3 + CloudFront + AWS Lambda)

## Features

| Category | Description |
|-----------|--------------|
| Smart retrieval | Fetches the latest news articles based on user topic or preset examples |
| AI summarization | Uses OpenAI GPT-5 family models (`nano`, `mini`) with adaptive prompt design |
| Structured output | Returns normalized `SummaryJson` objects (blocks, header, intro, outro) |
| Intelligent caching | Upstash Redis caching with stable hash keys and version control (`SUMM_V`) |
| Fallback safety | Extractive summary generator (`styleAwareFallback`) if LLM fails or times out |
| Copy & Download | One-click copy or `.md` export of AI summaries |
| Minimal UI | Built with Tailwind CSS + Framer Motion + Next.js static export |
| Serverless backend | AWS Lambda + API Gateway with CORS protection |
| Ready for CloudFront | Dual-origin setup: S3 (static UI) + Lambda API passthrough |

## Architecture Overview

```
User (Browser)
   │
   ▼
[CloudFront Distribution]
   ├── / → S3 Static Site (Next.js Export)
   └── /api/* → AWS API Gateway → Lambda (news-ai-agent-backend)
                   │
                   ├── OpenAI API (summarization)
                   └── Upstash Redis (caching)
```

## Tech Stack

- Frontend: Next.js 16 (SSG only), Tailwind CSS, Framer Motion
- Backend: AWS Lambda (Node.js 20), TypeScript, API Gateway
- AI: OpenAI GPT-5 (nano/mini)
- Cache: Upstash Redis REST API
- Infra (planned): S3 + CloudFront + Route53 + ACM SSL

## Environment Variables

| Variable | Description | Example |
|-----------|--------------|----------|
| `OPENAI_API_KEY` | Required, used for summarization | `sk-...` |
| `OPENAI_MODEL_FAST` | Default: `gpt-5-nano` | optional |
| `OPENAI_MODEL_QUALITY` | Default: `gpt-5-mini` | optional |
| `UPSTASH_REDIS_REST_URL` | Optional cache | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Optional cache token | `...` |
| `SUMM_V` | Cache version tag | `6` |
| `SUMM_DEBUG_NOCACHE` | If `1`, disables cache for debugging | `0` |
| `CORS_ORIGINS` | Allowed frontends | `https://news.tonynagy.io` |

## Summary Response Schema

```ts
export interface SummarizeResp {
  ok: boolean;
  cached?: boolean;
  count: number;
  mode: "fast" | "quality";
  style: "balanced" | "headline-first" | "key-points" | "risks";
  at: string; // ISO timestamp
  header?: string;
  intro?: string;
  outro?: string;
  blocks?: SummaryBlock[];
  summaryText?: string; // fallback text
}
```

## Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (Lambda local)
cd backend
npm install
npm run dev

# Build static site (SSG)
npm run build && npm run export
```

## Deployment (AWS)

1. Create S3 bucket `news.tonynagy.io`
2. Deploy static export:
   ```bash
   aws s3 sync out/ s3://news.tonynagy.io --delete --cache-control "public,max-age=300"
   ```
3. Create CloudFront distribution:
   - Origin #1: S3 (OAC)
   - Origin #2: API Gateway (path pattern `/api/*`)
4. Point Route53 alias `news.tonynagy.io → CloudFront`
5. Validate CORS in backend

## Example Output

```
Balanced summary (en) — 3 item(s):

[1] WhatsApp bans AI bots and Perplexity from using its tools — Republic World — Read more »
[2] Verifiler makes new policy changes for users — Inc. Magazine — Read more »
[3] From Donald Trump standing with Pokémon characters to McDonald's mascot fleeing — Benzinga — Read more »

— End of summary —
```

## Future Plans

- Multi-language summarization (EN/DE/FR/ES)
- Source scoring (bias, credibility)
- Trending topic detection
- Embeddable “AI News Widget”
- Public “Share Summary” links via presigned S3 JSON

## Author

**Tony Nagy**  
Software Engineer — Cloud, AI & Automation  
Portfolio: https://www.tonynagy.io  
GitHub: https://github.com/tonynagyeurope  
LinkedIn: https://www.linkedin.com/in/antal-nagy-2761518b
