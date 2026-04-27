import { NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { SectorData } from '@/lib/types';

export const dynamic = 'force-dynamic';

function isSectorMap(data: Awaited<ReturnType<typeof PSXApi.getStats>>): data is Record<string, SectorData> {
  return !('totalVolume' in data) && !('advances' in data);
}

export async function GET() {
  try {
    const sectors = await PSXApi.getStats('sectors');

    if (!isSectorMap(sectors)) {
      return NextResponse.json({ error: 'Unexpected sector stats response' }, { status: 502 });
    }

    return NextResponse.json({
      sectors,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load sector stats',
      },
      { status: 502 },
    );
  }
}
