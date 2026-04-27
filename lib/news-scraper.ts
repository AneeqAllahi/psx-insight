import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { readSupabaseNewsStore, writeSupabaseNewsStore } from './supabase-news-store';

const METTIS_BASE_URL = 'https://mettisglobal.news';
const PSX_BASE_URL = 'https://dps.psx.com.pk';
const SBP_PRESS_INDEX_URL = 'https://www.sbp.org.pk/press/2026/index2.asp';
const NEWS_STORE_PATH = path.join(process.cwd(), 'data', 'news', 'articles.json');
const SCRAPE_INTERVAL_MS = 30 * 60 * 1000;
const ARTICLE_DELAY_MS = 2_000;
const MAX_METTIS_ARTICLES = 20;
const MAX_PSX_ARTICLES = 25;
const MAX_SBP_ARTICLES = 25;
const MAX_ARTICLE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface NewsArticle {
  headline: string;
  url: string;
  category: string;
  publishedAt: string;
  summary: string;
  fullText: string;
  symbols: string[];
  source?: string;
}

interface CandidateArticle {
  headline: string;
  url: string;
  category: string;
  publishedAt?: string;
  summary?: string;
  fullText?: string;
  symbols?: string[];
  source?: string;
}

interface NewsStore {
  lastScrapedAt: string | null;
  articles: NewsArticle[];
}

declare global {
  // eslint-disable-next-line no-var
  var __psxNewsScheduler: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __psxNewsScrapePromise: Promise<NewsArticle[]> | undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href: string, baseUrl: string) {
  return new URL(href, baseUrl).toString();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMettisPublishedAt(value: string) {
  const match = value.match(/[A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} [AP]M GMT[+-]\d{2}:\d{2}/);
  if (!match) return new Date().toISOString();

  const parsed = new Date(match[0].replace(' at ', ' '));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parsePSXDate(date: string, time: string) {
  const parsed = new Date(`${date} ${time} GMT+0500`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseSBPDateFromHref(href: string) {
  const match = href.match(/Pr-(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (!match) return new Date().toISOString();

  const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} GMT+0500`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function inferSource(url: string) {
  if (url.includes('mettisglobal.news')) return 'Mettis Global';
  if (url.includes('dps.psx.com.pk') || url.includes('psx.com.pk')) return 'Pakistan Stock Exchange';
  if (url.includes('sbp.org.pk')) return 'State Bank of Pakistan';
  return undefined;
}

function inferCategoryFromSection($: cheerio.CheerioAPI, element: AnyNode) {
  const container = $(element).parents('section, .container, .row').first();
  const heading = normalizeText(
    container
      .find('h1, h2, h3, h4, .section-title, .TitleStyle')
      .first()
      .text(),
  );

  if (heading && heading.length < 80 && !heading.includes($(element).text().trim())) {
    return heading;
  }

  return 'Latest';
}

function extractSymbols(text: string) {
  const ignore = new Set([
    'AM',
    'BOE',
    'CEO',
    'CFO',
    'CPEC',
    'ECB',
    'EPS',
    'GDP',
    'GMT',
    'IPO',
    'KSE',
    'MLN',
    'MPC',
    'OMC',
    'PKR',
    'PM',
    'PR',
    'PSX',
    'SECP',
    'SBP',
    'USD',
  ]);
  const matches = text.match(/\b[A-Z]{2,6}\b/g) ?? [];
  return [...new Set(matches.filter((symbol) => !ignore.has(symbol)))].sort();
}

function getMettisHomepageArticles(html: string) {
  const $ = cheerio.load(html);
  const articles = new Map<string, CandidateArticle>();
  const selectors = [
    '.latest-news-content h2.HeadlineStyle a[href]',
    'h2.HeadlineStyle a[href]',
    '.LimitedHeading a[href]',
    `a[href^="${METTIS_BASE_URL}/"]`,
    'a[href^="/"]',
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const href = $(element).attr('href');
      const headline = normalizeText($(element).text());

      if (!href || headline.length < 18) return;

      const url = absoluteUrl(href, METTIS_BASE_URL);
      const isArticleUrl = /^https:\/\/mettisglobal\.news\/[^/?#]+-\d{4,}$/.test(url);

      if (!isArticleUrl || articles.has(url)) return;

      articles.set(url, {
        headline,
        url,
        category: inferCategoryFromSection($, element),
        source: 'Mettis Global',
      });
    });
  }

  return [...articles.values()].slice(0, MAX_METTIS_ARTICLES);
}

function extractMettisArticleText($: cheerio.CheerioAPI) {
  const paragraphs = $('.postNews .MsoNormal, .postNews p')
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter((text) => text.length > 30)
    .filter((text) => !/^MG News \|/.test(text))
    .filter((text) => !/^(Listen|Resize|Small|Medium|Large|Join our Whatsapp channel)$/i.test(text));

  if (paragraphs.length) return paragraphs.join('\n\n');

  const fallback = normalizeText($('.postNews').first().text());
  return fallback
    .replace(/^.*?GMT[+-]\d{2}:\d{2}/, '')
    .replace(/Listen Resize Small Medium Large.*?1x 2x/i, '')
    .trim();
}

async function fetchMettisArticleDetails(article: CandidateArticle): Promise<NewsArticle> {
  const res = await fetch(article.url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)',
    },
  });

  if (!res.ok) throw new Error(`Mettis article fetch failed: ${res.status} on ${article.url}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const headline = normalizeText($('h1').first().text()) || article.headline;
  const metaSummary =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';
  const fullText = extractMettisArticleText($);
  const summary = normalizeText(metaSummary) || fullText.slice(0, 240);
  const publishedAt = parseMettisPublishedAt(normalizeText($('.postNews .Listnewscategroy').first().text()));
  const symbols = extractSymbols(`${headline} ${summary} ${fullText}`);

  return {
    headline,
    url: article.url,
    category: article.category,
    publishedAt,
    summary,
    fullText,
    symbols,
    source: article.source,
  };
}

async function getPSXAnnouncements() {
  const articles = new Map<string, CandidateArticle>();
  const types = [
    { type: 'D', category: 'PSX Notices' },
    { type: 'C', category: 'Company Announcements' },
  ];

  for (const { type, category } of types) {
    const body = new URLSearchParams({
      type,
      symbol: '',
      query: '',
      count: String(MAX_PSX_ARTICLES),
      offset: '0',
      date_from: '',
      date_to: '',
      page: 'annc',
    });
    const res = await fetch(`${PSX_BASE_URL}/announcements`, {
      method: 'POST',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `${PSX_BASE_URL}/announcements/psx`,
        'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body,
    });

    if (!res.ok) throw new Error(`PSX announcements fetch failed: ${res.status}`);

    const $ = cheerio.load(await res.text());
    $('#announcementsTable tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      const date = normalizeText(cells.eq(0).text());
      const time = normalizeText(cells.eq(1).text());
      const hasCompanyColumns = cells.length >= 6;
      const symbol = hasCompanyColumns ? normalizeText(cells.eq(2).text()) : '';
      const name = hasCompanyColumns ? normalizeText(cells.eq(3).text()) : '';
      const title = normalizeText(cells.eq(hasCompanyColumns ? 4 : 2).text());
      const link = cells
        .last()
        .find('a[href*="/download/attachment/"]')
        .first()
        .attr('href');

      if (!title) return;

      const url = link
        ? absoluteUrl(link, PSX_BASE_URL)
        : `${PSX_BASE_URL}/announcements/psx?symbol=${encodeURIComponent(symbol)}&title=${encodeURIComponent(title)}`;
      const summary = [symbol, name, title].filter(Boolean).join(' - ');
      const fullText = [category, date, time, summary, url].filter(Boolean).join('\n');
      const symbols = [...new Set([symbol, ...extractSymbols(`${title} ${summary}`)].filter(Boolean))].sort();

      articles.set(`${date}-${time}-${symbol}-${title}`, {
        headline: title,
        url,
        category,
        publishedAt: parsePSXDate(date, time),
        summary,
        fullText,
        symbols,
        source: 'Pakistan Stock Exchange',
      });
    });
  }

  return [...articles.values()];
}

async function getSBPPressReleases() {
  const res = await fetch(SBP_PRESS_INDEX_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)',
    },
  });

  if (!res.ok) throw new Error(`SBP press release fetch failed: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const articles: CandidateArticle[] = [];

  $('a[href$=".pdf"]').each((_, element) => {
    const href = $(element).attr('href');
    const headline = normalizeText($(element).text());

    if (!href || !headline || /^Click Here$/i.test(headline) || /-U(?:-|\.pdf)/i.test(href)) return;

    const url = absoluteUrl(href, SBP_PRESS_INDEX_URL);
    const fullText = `State Bank of Pakistan press release\n${headline}\n${url}`;

    articles.push({
      headline,
      url,
      category: /monetary policy|policy rate/i.test(headline) ? 'Monetary Policy' : 'SBP Press Release',
      publishedAt: parseSBPDateFromHref(href),
      summary: headline,
      fullText,
      symbols: extractSymbols(fullText),
      source: 'State Bank of Pakistan',
    });
  });

  return articles.slice(0, MAX_SBP_ARTICLES);
}

async function readStore(): Promise<NewsStore> {
  const supabaseStore = await readSupabaseNewsStore();
  if (supabaseStore) return supabaseStore;

  try {
    const raw = await readFile(NEWS_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as NewsStore;
    return {
      lastScrapedAt: parsed.lastScrapedAt ?? null,
      articles: Array.isArray(parsed.articles)
        ? parsed.articles.map((article) => ({
            ...article,
            source: article.source ?? inferSource(article.url),
          }))
        : [],
    };
  } catch {
    return { lastScrapedAt: null, articles: [] };
  }
}

async function writeStore(store: NewsStore) {
  if (await writeSupabaseNewsStore(store)) return;

  await mkdir(path.dirname(NEWS_STORE_PATH), { recursive: true });
  await writeFile(NEWS_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
}

function pruneArticles(articles: NewsArticle[]) {
  const cutoff = Date.now() - MAX_ARTICLE_AGE_MS;
  const deduped = new Map<string, NewsArticle>();

  for (const article of articles.filter((item) => new Date(item.publishedAt).getTime() >= cutoff)) {
    const key = [
      article.source ?? inferSource(article.url) ?? '',
      article.publishedAt,
      article.headline,
      article.symbols.join(','),
    ].join('|');
    const existing = deduped.get(key);

    if (!existing || article.url.length > existing.url.length) {
      deduped.set(key, article);
    }
  }

  return [...deduped.values()].sort(
    (current, next) => new Date(next.publishedAt).getTime() - new Date(current.publishedAt).getTime(),
  );
}

function materializeCandidate(article: CandidateArticle): NewsArticle {
  const fullText = article.fullText ?? article.summary ?? article.headline;

  return {
    headline: article.headline,
    url: article.url,
    category: article.category,
    publishedAt: article.publishedAt ?? new Date().toISOString(),
    summary: article.summary ?? article.headline,
    fullText,
    symbols: article.symbols ?? extractSymbols(`${article.headline} ${fullText}`),
    source: article.source,
  };
}

export async function scrapeMettisNews() {
  if (globalThis.__psxNewsScrapePromise) return globalThis.__psxNewsScrapePromise;

  globalThis.__psxNewsScrapePromise = (async () => {
    const store = await readStore();
    const existingByUrl = new Map(store.articles.map((article) => [article.url, article]));
    const homepageRes = await fetch(METTIS_BASE_URL, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)',
      },
    });

    if (!homepageRes.ok) throw new Error(`Mettis homepage fetch failed: ${homepageRes.status}`);

    const homepageArticles = [
      ...getMettisHomepageArticles(await homepageRes.text()),
      ...(await getPSXAnnouncements()),
      ...(await getSBPPressReleases()),
    ];
    const nextArticles = [...store.articles];

    for (const article of homepageArticles) {
      if (existingByUrl.has(article.url)) continue;

      const detailedArticle = article.fullText
        ? materializeCandidate(article)
        : await (async () => {
            await delay(ARTICLE_DELAY_MS);
            return fetchMettisArticleDetails(article);
          })();

      nextArticles.push(detailedArticle);
      existingByUrl.set(article.url, detailedArticle);
    }

    const articles = pruneArticles(nextArticles);
    await writeStore({
      lastScrapedAt: new Date().toISOString(),
      articles,
    });

    return articles;
  })().finally(() => {
    globalThis.__psxNewsScrapePromise = undefined;
  });

  return globalThis.__psxNewsScrapePromise;
}

export async function getStoredNews() {
  const store = await readStore();
  return pruneArticles(store.articles);
}

export async function getNewsWithRefresh() {
  const store = await readStore();
  const lastScrapedAt = store.lastScrapedAt ? new Date(store.lastScrapedAt).getTime() : 0;
  const isStale = Date.now() - lastScrapedAt > SCRAPE_INTERVAL_MS;

  if (isStale || store.articles.length === 0) {
    return scrapeMettisNews();
  }

  return pruneArticles(store.articles);
}

export function ensureNewsScheduler() {
  if (globalThis.__psxNewsScheduler) return;

  globalThis.__psxNewsScheduler = setInterval(() => {
    scrapeMettisNews().catch((error) => {
      console.error('Scheduled news scrape failed', error);
    });
  }, SCRAPE_INTERVAL_MS);

  scrapeMettisNews().catch((error) => {
    console.error('Initial news scrape failed', error);
  });
}
