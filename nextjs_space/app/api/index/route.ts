import { NextResponse } from 'next/server';
import { fetchMasterIndex } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ruleSets = await fetchMasterIndex();
    return NextResponse.json({ ruleSets });
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    console.warn('WestLaw master index unavailable:', msg);
    const status = msg.match(/(\d{3})/)?.[1];
    return NextResponse.json({
      ruleSets: [],
      upstreamError: status ? `WestLaw responded with HTTP ${status}` : 'Failed to reach WestLaw',
    });
  }
}
