import { NewsArticle, SearchRequest, SearchResponse } from '@shared/types.js';

export async function searchNewsApi(req: SearchRequest): Promise<SearchResponse> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) throw new Error('NEWSAPI_KEY missing');
  const q = encodeURIComponent(`"${req.topic}"`);
  const pageSize = String(req.limit ?? 5);
  const url = `https://newsapi.org/v2/everything?q=${q}&pageSize=${pageSize}&sortBy=publishedAt&language=${req.lang ?? 'en'}`;

  const r = await fetch(url, { 
      headers: { 
        'X-Api-Key': key       
      } 
  });
  if (!r.ok) throw new Error(`NewsAPI HTTP ${r.status}`);
  const data = await r.json() as { articles: Array<{
    title: string; url: string; publishedAt: string; description?: string; urlToImage?: string; source?: { name?: string }
  }> };

  const articles: NewsArticle[] = (data.articles ?? []).map((a, i) => ({
    id: String(i),
    title: a.title,
    url: a.url,
    source: a.source?.name ?? 'NewsAPI',
    publishedAt: a.publishedAt ?? new Date().toISOString(),
    description: a.description,
    imageUrl: a.urlToImage
  }));

  return { provider: 'newsapi', articles };
}
