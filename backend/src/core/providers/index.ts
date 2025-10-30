import { SearchRequest, SearchResponse } from '@shared/types.js';
import { searchGNews } from './gnews.js';
import { searchNewsApi } from './newsapi.js';
import { getNewsProvider } from '../../lib/env.js';

export async function searchNewsWithFallback(req: SearchRequest): Promise<SearchResponse> {
  const pref = getNewsProvider();
  const chain =
    pref === 'auto'
      ? [() => searchGNews(req), () => searchNewsApi(req)]
      : pref === 'gnews'
        ? [() => searchGNews(req)]
        : [() => searchNewsApi(req)];

  let lastErr: unknown = null;
  for (const fn of chain) {
    try {
      const res = await fn();
      if (res.articles.length > 0) return res;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`All providers failed: ${String(lastErr)}`);
}
