import type { NewsArticle } from './news-scraper';

const MAX_ARTICLE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SupabaseArticleRow {
  headline: string;
  url: string;
  category: string;
  published_at: string;
  summary: string;
  full_text: string;
  symbols: string[];
  source: string | null;
}

interface SupabaseMetadataRow {
  key: string;
  value: {
    lastScrapedAt?: string | null;
  } | null;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return {
    url: url.replace(/\/$/, ''),
    serviceKey,
  };
}

function headers(serviceKey: string, prefer?: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function toArticle(row: SupabaseArticleRow): NewsArticle {
  return {
    headline: row.headline,
    url: row.url,
    category: row.category,
    publishedAt: row.published_at,
    summary: row.summary,
    fullText: row.full_text,
    symbols: row.symbols ?? [],
    source: row.source ?? undefined,
  };
}

function toRow(article: NewsArticle): SupabaseArticleRow {
  return {
    headline: article.headline,
    url: article.url,
    category: article.category,
    published_at: article.publishedAt,
    summary: article.summary,
    full_text: article.fullText,
    symbols: article.symbols,
    source: article.source ?? null,
  };
}

export function hasSupabaseNewsStore() {
  return Boolean(getSupabaseConfig());
}

export async function readSupabaseNewsStore() {
  const config = getSupabaseConfig();
  if (!config) return null;

  const cutoff = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString();
  const [articlesRes, metadataRes] = await Promise.all([
    fetch(
      `${config.url}/rest/v1/news_articles?select=*&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=500`,
      {
        headers: headers(config.serviceKey),
        cache: 'no-store',
      },
    ),
    fetch(`${config.url}/rest/v1/news_metadata?select=*&key=eq.scraper&limit=1`, {
      headers: headers(config.serviceKey),
      cache: 'no-store',
    }),
  ]);

  if (!articlesRes.ok) throw new Error(`Supabase news read failed: ${articlesRes.status}`);
  if (!metadataRes.ok) throw new Error(`Supabase metadata read failed: ${metadataRes.status}`);

  const articles = (await articlesRes.json()) as SupabaseArticleRow[];
  const metadata = (await metadataRes.json()) as SupabaseMetadataRow[];

  return {
    lastScrapedAt: metadata[0]?.value?.lastScrapedAt ?? null,
    articles: articles.map(toArticle),
  };
}

export async function writeSupabaseNewsStore(store: { lastScrapedAt: string | null; articles: NewsArticle[] }) {
  const config = getSupabaseConfig();
  if (!config) return false;

  const cutoff = new Date(Date.now() - MAX_ARTICLE_AGE_MS).toISOString();
  const rows = store.articles.map(toRow);

  if (rows.length) {
    const upsertRes = await fetch(`${config.url}/rest/v1/news_articles?on_conflict=url`, {
      method: 'POST',
      headers: headers(config.serviceKey, 'resolution=merge-duplicates'),
      body: JSON.stringify(rows),
    });

    if (!upsertRes.ok) throw new Error(`Supabase news write failed: ${upsertRes.status}`);
  }

  const deleteRes = await fetch(`${config.url}/rest/v1/news_articles?published_at=lt.${encodeURIComponent(cutoff)}`, {
    method: 'DELETE',
    headers: headers(config.serviceKey),
  });

  if (!deleteRes.ok) throw new Error(`Supabase news prune failed: ${deleteRes.status}`);

  const metadataRes = await fetch(`${config.url}/rest/v1/news_metadata?on_conflict=key`, {
    method: 'POST',
    headers: headers(config.serviceKey, 'resolution=merge-duplicates'),
    body: JSON.stringify([
      {
        key: 'scraper',
        value: { lastScrapedAt: store.lastScrapedAt },
      },
    ]),
  });

  if (!metadataRes.ok) throw new Error(`Supabase metadata write failed: ${metadataRes.status}`);

  return true;
}
