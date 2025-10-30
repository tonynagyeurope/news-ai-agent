// shared/types.ts

export type SummaryStyle = 'balanced' | 'headline-first' | 'key-points' | 'risks';

export interface NewsItem {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

export interface SearchNewsResp {
  ok?: boolean;          
  items: NewsItem[];
  provider?: string;
  at?: string | null;    
  tookMs?: number;       
  cached?: boolean;
}

export interface TopicValidationInput { raw: string; locale?: 'en'|'de'|'hu'|'ar'; }
export interface TopicValidationOutput { valid: boolean; topic: string; reason?: string; }

// Single source of truth for real providers.
// Adding 'bing' later if we actually integrate it.
export type NewsProvider = 'gnews' | 'newsapi';

// --- Actions (single source of truth) ---
export const AllowedActions = [
  'GET_HOMEPAGE_TITLE',
  'LIST_HEADLINES',
  'FIND_CONTACT_PAGE',
  'EXTRACT_SOCIALS',
  'CHECK_SITEMAP',
  'CHECK_ROBOTS'
] as const;

export type AllowedAction = typeof AllowedActions[number];

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  description?: string;
}

export interface SearchRequest { topic: string; limit?: number; lang?: string; freshHours?: number; }
export interface SearchResponse { articles: NewsArticle[]; provider: NewsProvider; cached?: boolean; }

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface SummarizedArticle extends NewsArticle {
  summary: string;               // 2–3 sentences
  sentiment: Sentiment;
  entities: string[];            // max 5
}

export interface SummarizeRequest { topic: string; articles: NewsArticle[]; }
export interface SummarizeResponse {
  topic: string;
  articles: SummarizedArticle[];
  audit: { model: string; promptTokens?: number; outputTokens?: number; latencyMs: number; };
  snapshotKey?: string;
}

export interface Snapshot {
  snapshotId: string;            // ulid
  topic: string;
  createdAt: string;             // ISO
  articles: SummarizedArticle[];
  audit: { model: string; promptTokens: number; outputTokens: number; latencyMs: number; };
}
