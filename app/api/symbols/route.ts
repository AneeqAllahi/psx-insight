import { NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const symbols = await PSXApi.getSymbols();
    return NextResponse.json({ symbols, updatedAt: Date.now() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load symbols' },
      { status: 502 },
    );
  }
}

