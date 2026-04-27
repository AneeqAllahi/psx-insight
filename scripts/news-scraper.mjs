import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const METTIS_BASE_URL = 'https://mettisglobal.news';
const PSX_BASE_URL = 'https://dps.psx.com.pk';
const SBP_PRESS_INDEX_URL = 'https://www.sbp.org.pk/press/2026/index2.asp';
const STORE_PATH = path.join(process.cwd(), 'data', 'news', 'articles.json');
const INTERVAL_MS = 30 * 60 * 1000;
const ARTICLE_DELAY_MS = 2_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const absoluteUrl = (href, baseUrl) => new URL(href, baseUrl).toString();

function parseMettisPublishedAt(value) {
  const match = value.match(/[A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} [AP]M GMT[+-]\d{2}:\d{2}/);
  if (!match) return new Date().toISOString();
  const parsed = new Date(match[0].replace(' at ', ' '));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parsePSXDate(date, time) {
  const parsed = new Date(`${date} ${time} GMT+0500`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseSBPDateFromHref(href) {
  const match = href.match(/Pr-(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (!match) return new Date().toISOString();
  const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} GMT+0500`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function inferSource(url) {
  if (url.includes('mettisglobal.news')) return 'Mettis Global';
  if (url.includes('dps.psx.com.pk') || url.includes('psx.com.pk')) return 'Pakistan Stock Exchange';
  if (url.includes('sbp.org.pk')) return 'State Bank of Pakistan';
  return undefined;
}

function extractSymbols(text) {
  const ignore = new Set(['AM', 'BOE', 'CEO', 'CFO', 'CPEC', 'ECB', 'EPS', 'GDP', 'GMT', 'IPO', 'KSE', 'MLN', 'MPC', 'OMC', 'PKR', 'PM', 'PR', 'PSX', 'SECP', 'SBP', 'USD']);
  return [...new Set((text.match(/\b[A-Z]{2,6}\b/g) ?? []).filter((symbol) => !ignore.has(symbol)))].sort();
}

async function readStore() {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf-8'));
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

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
}

function getMettisHomepageArticles(html) {
  const $ = cheerio.load(html);
  const articles = new Map();

  $('.latest-news-content h2.HeadlineStyle a[href], h2.HeadlineStyle a[href], .LimitedHeading a[href], a[href^="https://mettisglobal.news/"], a[href^="/"]').each((_, element) => {
    const href = $(element).attr('href');
    const headline = normalizeText($(element).text());
    if (!href || headline.length < 18) return;
    const url = absoluteUrl(href, METTIS_BASE_URL);
    if (!/^https:\/\/mettisglobal\.news\/[^/?#]+-\d{4,}$/.test(url) || articles.has(url)) return;
    articles.set(url, { headline, url, category: 'Latest', source: 'Mettis Global' });
  });

  return [...articles.values()].slice(0, 20);
}

async function fetchMettisArticle(article) {
  const html = await (await fetch(article.url, { headers: { Accept: 'text/html', 'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)' } })).text();
  const $ = cheerio.load(html);
  const headline = normalizeText($('h1').first().text()) || article.headline;
  const fullText = $('.postNews .MsoNormal, .postNews p')
    .map((_, element) => normalizeText($(element).text()))
    .get()
    .filter((text) => text.length > 30)
    .filter((text) => !/^MG News \|/.test(text))
    .join('\n\n');
  const summary = normalizeText($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || fullText.slice(0, 240));
  const publishedAt = parseMettisPublishedAt(normalizeText($('.postNews .Listnewscategroy').first().text()));

  return {
    headline,
    url: article.url,
    category: article.category,
    publishedAt,
    summary,
    fullText,
    symbols: extractSymbols(`${headline} ${summary} ${fullText}`),
    source: article.source,
  };
}

async function getPSXAnnouncements() {
  const articles = new Map();
  const types = [
    { type: 'D', category: 'PSX Notices' },
    { type: 'C', category: 'Company Announcements' },
  ];

  for (const { type, category } of types) {
    const body = new URLSearchParams({ type, symbol: '', query: '', count: '25', offset: '0', date_from: '', date_to: '', page: 'annc' });
    const html = await (await fetch(`${PSX_BASE_URL}/announcements`, {
      method: 'POST',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `${PSX_BASE_URL}/announcements/psx`,
        'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body,
    })).text();
    const $ = cheerio.load(html);

    $('#announcementsTable tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      const date = normalizeText(cells.eq(0).text());
      const time = normalizeText(cells.eq(1).text());
      const hasCompanyColumns = cells.length >= 6;
      const symbol = hasCompanyColumns ? normalizeText(cells.eq(2).text()) : '';
      const name = hasCompanyColumns ? normalizeText(cells.eq(3).text()) : '';
      const title = normalizeText(cells.eq(hasCompanyColumns ? 4 : 2).text());
      const link = cells.last().find('a[href*="/download/attachment/"]').first().attr('href');
      if (!title) return;
      const url = link ? absoluteUrl(link, PSX_BASE_URL) : `${PSX_BASE_URL}/announcements/psx?symbol=${encodeURIComponent(symbol)}&title=${encodeURIComponent(title)}`;
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
  const html = await (await fetch(SBP_PRESS_INDEX_URL, { headers: { Accept: 'text/html', 'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)' } })).text();
  const $ = cheerio.load(html);
  const articles = [];

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

  return articles.slice(0, 25);
}

async function scrape() {
  const store = await readStore();
  const seen = new Map((store.articles ?? []).map((article) => [article.url, article]));
  const mettisHtml = await (await fetch(METTIS_BASE_URL, { headers: { Accept: 'text/html', 'User-Agent': 'PSX-Insight-NewsBot/1.0 (+local dashboard)' } })).text();
  const candidates = [
    ...getMettisHomepageArticles(mettisHtml),
    ...(await getPSXAnnouncements()),
    ...(await getSBPPressReleases()),
  ];
  const articles = [...(store.articles ?? [])];

  for (const article of candidates) {
    if (seen.has(article.url)) continue;
    const detailed = article.fullText
      ? article
      : await (async () => {
          await delay(ARTICLE_DELAY_MS);
          return fetchMettisArticle(article);
        })();
    articles.push(detailed);
    seen.set(article.url, detailed);
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const deduped = new Map();

  for (const article of articles.filter((item) => new Date(item.publishedAt).getTime() >= cutoff)) {
    const key = [
      article.source ?? inferSource(article.url) ?? '',
      article.publishedAt,
      article.headline,
      (article.symbols ?? []).join(','),
    ].join('|');
    const existing = deduped.get(key);

    if (!existing || article.url.length > existing.url.length) {
      deduped.set(key, article);
    }
  }

  const pruned = [...deduped.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  await writeStore({ lastScrapedAt: new Date().toISOString(), articles: pruned });
  console.log(`Stored ${pruned.length} articles from Mettis, PSX, and SBP`);
}

await scrape();

if (process.argv.includes('--watch')) {
  setInterval(() => scrape().catch((error) => console.error(error)), INTERVAL_MS);
}
