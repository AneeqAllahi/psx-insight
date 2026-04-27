import { NextRequest, NextResponse } from 'next/server';
import { getNewsWithRefresh } from '@/lib/news-scraper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  const articles = await getNewsWithRefresh();
  const filteredArticles = symbol
    ? articles.filter((article) => article.symbols.includes(symbol))
    : articles;

  return NextResponse.json({
    articles: filteredArticles,
    count: filteredArticles.length,
    symbol: symbol ?? null,
  });
}
