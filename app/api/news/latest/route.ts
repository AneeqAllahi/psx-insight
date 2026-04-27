import { NextRequest, NextResponse } from 'next/server';
import { getNewsWithRefresh } from '@/lib/news-scraper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
  const articles = await getNewsWithRefresh();

  return NextResponse.json({
    articles: articles.slice(0, limit),
    count: Math.min(articles.length, limit),
    limit,
  });
}
