import { NextRequest } from 'next/server';
import { scrapeRuleSetCompletely } from '@/lib/scraper';
import { sendAdminNotification, formatScrapeCompletedEmail, formatScrapeFailedEmail } from '@/lib/notifications';

export const maxDuration = 300; // 5 minutes max for scraping
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const guid = searchParams.get('guid');
  const title = searchParams.get('title');
  const delayMs = parseInt(searchParams.get('delayMs') || '100', 10);
  const timeoutMs = parseInt(searchParams.get('timeoutMs') || '15000', 10);
  const concurrency = parseInt(searchParams.get('concurrency') || '3', 10);

  if (!guid || !title) {
    return new Response(
      JSON.stringify({ error: 'Missing guid or title parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const startTime = Date.now();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: Record<string, unknown>) => {
        const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('log', { message: `Starting scrape for: ${title}`, timestamp: new Date().toISOString() });
        
        const result = await scrapeRuleSetCompletely(
          guid, 
          title, 
          (message, progress) => {
            sendEvent('progress', { message, progress, timestamp: new Date().toISOString() });
          },
          { delayMs, timeoutMs, concurrency }
        );

        sendEvent('complete', { data: result });

        // Calculate failed documents
        const docGuids = new Set(result.documents.map(d => d.guid));
        let failedCount = 0;
        const countMissing = (nodes: typeof result.structure) => {
          for (const node of nodes) {
            if (node.type === 'document' && !docGuids.has(node.guid)) failedCount++;
            if (node.children) countMissing(node.children);
          }
        };
        countMissing(result.structure);

        // Send completion notification (don't await - fire and forget)
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
        sendAdminNotification({
          notificationId: process.env.NOTIF_ID_SCRAPE_COMPLETED || '',
          subject: `Scrape ${failedCount > 0 ? 'completed with errors' : 'completed'}: ${title}`,
          body: formatScrapeCompletedEmail({
            title,
            guid,
            documentsCount: result.documents.length,
            categoriesCount: result.metadata.totalCategories,
            failedCount,
            elapsedTime,
          }),
        });
      } catch (error) {
        const errorMessage = (error as Error)?.message ?? 'Unknown error';
        console.error('Scrape failed:', error);
        sendEvent('error', { message: `Scrape failed: ${errorMessage}`, timestamp: new Date().toISOString() });

        // Send failure notification (don't await - fire and forget)
        sendAdminNotification({
          notificationId: process.env.NOTIF_ID_SCRAPE_FAILED || '',
          subject: `Scrape failed: ${title}`,
          body: formatScrapeFailedEmail({
            title,
            guid,
            errorMessage,
          }),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
