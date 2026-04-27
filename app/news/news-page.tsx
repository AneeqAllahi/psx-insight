'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface NewsArticle {
  headline: string;
  url: string;
  category: string;
  publishedAt: string;
  summary: string;
  symbols: string[];
  source?: string;
}

interface NewsResponse {
  articles: NewsArticle[];
  count: number;
}

async function fetchNews(): Promise<NewsResponse> {
  const res = await fetch('/api/news/latest?limit=50', { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load news');
  }

  return res.json();
}

function categoryGroup(article: NewsArticle) {
  const text = `${article.category} ${article.source ?? ''} ${article.headline}`.toLowerCase();

  if (text.includes('announcement') || text.includes('notice') || text.includes('exchange')) return 'Announcements';
  if (text.includes('monetary') || text.includes('sbp') || text.includes('policy') || text.includes('macro')) return 'Macro';
  if (text.includes('result') || text.includes('earnings') || text.includes('profit')) return 'Results';
  return article.category || 'Other';
}

export function NewsPage() {
  const [category, setCategory] = useState('All');
  const { data, error, isFetching, isLoading } = useQuery({
    queryKey: ['news-feed'],
    queryFn: fetchNews,
    refetchInterval: 30_000,
  });
  const articles = data?.articles ?? [];
  const groupedArticles = useMemo(
    () => articles.map((article) => ({ ...article, categoryGroup: categoryGroup(article) })),
    [articles],
  );
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(groupedArticles.map((article) => article.categoryGroup))).sort()],
    [groupedArticles],
  );
  const visibleArticles = groupedArticles.filter((article) => (category === 'All' ? true : article.categoryGroup === category));

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-gray-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase text-cyan-300">News</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Market News Feed</h1>
            <p className="mt-3 text-sm text-gray-400">Mettis, PSX announcements, and SBP press releases.</p>
          </div>
          <div className="rounded border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200">
            {isFetching ? 'Refreshing' : `${visibleArticles.length} articles`}
          </div>
        </header>

        {error ? (
          <div className="rounded border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {error instanceof Error ? error.message : 'Unable to load news'}
          </div>
        ) : null}

        <div className="rounded border border-line bg-panel p-4">
          <label className="text-sm text-gray-400" htmlFor="category-filter">
            Category
          </label>
          <select
            id="category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-2 h-11 w-full rounded border border-line bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/70 sm:w-72"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <section className="flex flex-col gap-4">
          {visibleArticles.length > 0 ? (
            visibleArticles.map((article) => (
              <article key={article.url} className="rounded border border-line bg-panel p-5 transition hover:border-cyan-300/30">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{article.source ?? 'News'}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}</span>
                  <span className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-cyan-200">
                    {article.categoryGroup}
                  </span>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer" className="mt-3 block text-xl font-semibold text-white hover:underline">
                  {article.headline}
                </a>
                <p className="mt-3 text-sm leading-6 text-gray-400">{article.summary}</p>
                {article.symbols.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {article.symbols.map((symbol) => (
                      <Link
                        key={`${article.url}-${symbol}`}
                        href={`/stock?symbol=${encodeURIComponent(symbol)}`}
                        className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-100 hover:underline"
                      >
                        {symbol}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded border border-line bg-panel p-6 text-sm text-gray-500">
              {isLoading ? 'Loading news' : 'No articles match the current category.'}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
