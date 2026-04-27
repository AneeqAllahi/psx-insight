import { NextRequest, NextResponse } from 'next/server';
import { scrapeMettisNews } from '@/lib/news-scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const articles = await scrapeMettisNews();

  return NextResponse.json({
    ok: true,
    count: articles.length,
    refreshedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
