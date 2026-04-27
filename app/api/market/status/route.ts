import { NextResponse } from 'next/server';
import { describeMarketStatus, describeMarketStatusFromSchedule } from '@/lib/market-status';
import { PSXApi } from '@/lib/psx-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await PSXApi.getStatus();
    const marketStatus = describeMarketStatus(status.status, status.timestamp);

    return NextResponse.json({
      ...marketStatus,
      source: 'psx-api',
      updatedAt: Date.now(),
    });
  } catch (error) {
    const fallback = describeMarketStatusFromSchedule();

    return NextResponse.json({
      ...fallback,
      source: 'schedule-fallback',
      warning: error instanceof Error ? error.message : 'Unable to load market status',
      updatedAt: Date.now(),
    });
  }
}
