import { NewsArticle, SearchRequest, SearchResponse } from '@shared/types.js';

export async function searchGNews(req: SearchRequest): Promise<SearchResponse> {
  const token = process.env.GNEWS_API_KEY;
  if (!token) throw new Error('GNEWS_API_KEY missing');
  const q = encodeURIComponent(req.topic);
  const lang = encodeURIComponent(req.lang ?? 'en');
  const max = String(req.limit ?? 5);
  const url = `https://gnews.io/api/v4/search?q=${q}&lang=${lang}&max=${max}&sortby=publishedAt&token=${token}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`GNews HTTP ${r.status}`);
  const data = await r.json() as { articles: Array<{
    title: string; url: string; publishedAt: string; description?: string;
    image?: string; source?: { name?: string }
  }> };

  const articles: NewsArticle[] = (data.articles ?? []).map((a, i) => ({
    id: String(i),
    title: a.title,
    url: a.url,
    source: a.source?.name ?? 'GNews',
    publishedAt: a.publishedAt ?? new Date().toISOString(),
    description: a.description,
    imageUrl: a.image
  }));

  return { provider: 'gnews', articles };
}
