import { NextRequest, NextResponse } from 'next/server';
import { scrapeDocument } from '@/lib/scraper';

export const maxDuration = 120;

interface RetryRequest {
  documents: Array<{ guid: string; title: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: RetryRequest = await request.json();
    const { documents } = body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json(
        { error: 'No documents to retry' },
        { status: 400 }
      );
    }

    const results: {
      succeeded: Array<{ guid: string; title: string; document: any }>;
      failed: Array<{ guid: string; title: string; error: string }>;
    } = {
      succeeded: [],
      failed: [],
    };

    for (const doc of documents) {
      try {
        // Add small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const scrapedDoc = await scrapeDocument(doc.guid, 30000);
        results.succeeded.push({
          guid: doc.guid,
          title: doc.title,
          document: scrapedDoc,
        });
      } catch (err) {
        results.failed.push({
          guid: doc.guid,
          title: doc.title,
          error: (err as Error)?.message ?? 'Unknown error',
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Retry failed:', error);
    return NextResponse.json(
      { error: `Retry failed: ${(error as Error)?.message ?? 'Unknown error'}` },
      { status: 500 }
    );
  }
}
