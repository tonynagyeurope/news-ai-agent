// Client.tsx
'use client';
import { useState } from 'react';
import type { TopicValidationOutput, SearchResponse, SummarizeResponse } from '../../lib/types.js';
import { api } from '../../lib/api.js';

export default function Client() {
  const [raw, setRaw] = useState('');
  const [valid, setValid] = useState<TopicValidationOutput | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [sum, setSum] = useState<SummarizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null); setSum(null); setSearch(null); setValid(null); setLoading(true);
    try {
      const v = await api.validate(raw);
      setValid(v);
      const s = await api.search(v.topic, 5, 'en');
      setSearch(s);
      const out = await api.summarize(v.topic, s.articles);
      setSum(out);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium">Topic</label>
          <input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="e.g. blockchain security"
            className="w-full border rounded p-2" />
        </div>
        <button onClick={run} disabled={!raw || loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
          {loading ? 'Running…' : 'Run Agent'}
        </button>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}
      {valid && <div className="text-sm">Validated topic: <b>{valid.topic}</b></div>}

      {search && (
        <div>
          <h2 className="font-semibold mt-4 mb-2">Found articles ({search.provider}{search.cached ? ' • cached':''})</h2>
          <ul className="space-y-2">
            {search.articles.map(a=>(
              <li key={a.id} className="border rounded p-3">
                <a className="font-medium underline" href={a.url} target="_blank" rel="noreferrer">{a.title}</a>
                <div className="text-xs text-gray-500">{a.source} • {new Date(a.publishedAt).toLocaleString()}</div>
                {a.description && <div className="text-sm mt-1">{a.description}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sum && (
        <div>
          <h2 className="font-semibold mt-4 mb-2">AI Summaries</h2>
          <ul className="space-y-2">
            {sum.articles.map((a, i)=>(
              <li key={i} className="border rounded p-3">
                <div className="text-sm">{a.summary}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Sentiment: {a.sentiment} • Entities: {a.entities.join(', ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
