export async function sendAdminNotification({
  notificationId,
  subject,
  body,
}: {
  notificationId: string;
  subject: string;
  body: string;
}) {
  try {
    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'AZ Court Rules';
    const senderEmail = appUrl ? `noreply@${new URL(appUrl).hostname}` : 'noreply@mail.abacusai.app';

    const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: notificationId,
        subject,
        body,
        is_html: true,
        recipient_email: 'scarlion520@gmail.com',
        sender_email: senderEmail,
        sender_alias: appName,
      }),
    });

    const result = await response.json();
    if (!result.success && !result.notification_disabled) {
      console.error('Failed to send notification:', result.message);
    }
    return result;
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false };
  }
}

export function formatScrapeCompletedEmail({
  title,
  guid,
  documentsCount,
  categoriesCount,
  failedCount,
  elapsedTime,
}: {
  title: string;
  guid: string;
  documentsCount: number;
  categoriesCount: number;
  failedCount: number;
  elapsedTime: string;
}) {
  const statusColor = failedCount > 0 ? '#f59e0b' : '#10b981';
  const statusText = failedCount > 0 ? `Completed with ${failedCount} failed` : 'Completed Successfully';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 2px solid ${statusColor}; padding-bottom: 10px;">
        📄 Scrape ${statusText}
      </h2>
      <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 10px 0;"><strong>Rule Set:</strong> ${title}</p>
        <p style="margin: 10px 0;"><strong>GUID:</strong> <code>${guid}</code></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
        <p style="margin: 10px 0;"><strong>Documents Scraped:</strong> ${documentsCount}</p>
        <p style="margin: 10px 0;"><strong>Categories:</strong> ${categoriesCount}</p>
        ${failedCount > 0 ? `<p style="margin: 10px 0; color: #f59e0b;"><strong>Failed:</strong> ${failedCount}</p>` : ''}
        <p style="margin: 10px 0;"><strong>Time Elapsed:</strong> ${elapsedTime}</p>
      </div>
      <p style="color: #666; font-size: 12px;">
        Completed at: ${new Date().toLocaleString()}
      </p>
    </div>
  `;
}

export function formatScrapeFailedEmail({
  title,
  guid,
  errorMessage,
}: {
  title: string;
  guid: string;
  errorMessage: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">
        ❌ Scrape Failed
      </h2>
      <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 10px 0;"><strong>Rule Set:</strong> ${title}</p>
        <p style="margin: 10px 0;"><strong>GUID:</strong> <code>${guid}</code></p>
        <hr style="border: none; border-top: 1px solid #fecaca; margin: 15px 0;">
        <p style="margin: 10px 0;"><strong>Error:</strong></p>
        <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #ef4444; color: #b91c1c;">
          ${errorMessage}
        </div>
      </div>
      <p style="color: #666; font-size: 12px;">
        Failed at: ${new Date().toLocaleString()}
      </p>
    </div>
  `;
}
