import { NextResponse } from 'next/server';
import { fetchMasterIndex } from '@/lib/scraper';

export async function GET() {
  try {
    const ruleSets = await fetchMasterIndex();
    return NextResponse.json({ ruleSets });
  } catch (error) {
    console.error('Failed to fetch master index:', error);
    return NextResponse.json(
      { error: 'Failed to fetch master index' },
      { status: 500 }
    );
  }
}
