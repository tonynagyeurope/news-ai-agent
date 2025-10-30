'use client';

import type { NewsItem } from '../../../lib/api.js';
import { JSX } from 'react';

interface Props {
  item: NewsItem;
}

/** Type-safe access helper for optional string fields on NewsItem */
function getStringField(obj: Record<string, unknown>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    const v = obj[key];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/** Extracts hostname from a URL string (used as a fallback source label) */
function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Article card without image/snippet.
 * - Uses only fields that certainly exist in your model (title, url).
 * - Falls back to URL hostname if `source` is missing.
 * - `publishedAt` is shown only if present and string-typed.
 */
export function ArticleCard({ item }: Props): JSX.Element {
  const base: Record<string, unknown> = item as unknown as Record<string, unknown>;

  const title = getStringField(base, 'title') ?? 'Untitled';
  const url = getStringField(base, 'url') ?? '#';

  const source = getStringField(base, 'source') ?? (url !== '#' ? hostnameOf(url) : undefined);
  const publishedAt = getStringField(base, 'publishedAt');

  return (
    <article className="group overflow-hidden rounded-2xl border hover:shadow-md transition-shadow">
      <div className="p-4">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 group-hover:underline"
          >
            {title}
          </a>
        </h3>

        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          {source && <span>{source}</span>}
          {publishedAt && <span>· {new Date(publishedAt).toLocaleDateString()}</span>}
        </div>
      </div>
    </article>
  );
}
