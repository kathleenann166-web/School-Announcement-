import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { db } from './db.ts';

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_HOST.trim() &&
      process.env.SMTP_USER &&
      process.env.SMTP_USER.trim() &&
      process.env.SMTP_PASS &&
      process.env.SMTP_PASS.trim()
  );
}

export interface AnnouncementForEmail {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: 'normal' | 'important' | 'urgent';
  audience: string;
  eventDate: string;
  authorName: string;
  createdAt: string;
}

export interface DispatchSummaryRow {
  email: string;
  name: string;
  unit: string;
  status: 'sent' | 'queued_preview' | 'failed';
  error?: string;
}

export interface EmailDispatchRecord {
  id: string;
  announcementId: string;
  announcementTitle: string;
  triggeredByName: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryMode: 'smtp' | 'outbox_preview';
  subject: string;
  htmlPreview: string;
  recipientsSummary: DispatchSummaryRow[];
  createdAt: string;
}

function getPortalIdentity(): { universityName: string; campusName: string } {
  const row = db
    .prepare("SELECT university_name, campus_name FROM portal_settings WHERE id = 'default'")
    .get() as { university_name: string; campus_name: string } | undefined;
  return {
    universityName: row?.university_name || 'Occidental Mindoro State University',
    campusName: row?.campus_name || 'Mamburao Campus · Occidental Mindoro',
  };
}

function buildEmailHtml(
  announcement: AnnouncementForEmail,
  appUrl: string,
  identity: { universityName: string; campusName: string }
): string {
  const priorityLabel =
    announcement.priority === 'urgent'
      ? 'URGENT CAMPUS NOTICE'
      : announcement.priority === 'important'
        ? 'IMPORTANT NOTICE'
        : 'CAMPUS ANNOUNCEMENT';

  const priorityAccent =
    announcement.priority === 'urgent'
      ? '#DC2626'
      : announcement.priority === 'important'
        ? '#D97706'
        : '#1E3A8A';

  const safeTitle = escapeHtml(announcement.title);
  const safeBody = escapeHtml(announcement.body).replaceAll('\n', '<br />');
  const safeCategory = escapeHtml(announcement.category);
  const safeAudience = escapeHtml(announcement.audience);
  const safeAuthor = escapeHtml(announcement.authorName);
  const safeDate = announcement.eventDate ? escapeHtml(announcement.eventDate) : '';
  const safePortalUrl = escapeHtml(appUrl || 'http://localhost:3000');
  const safeSchool = escapeHtml(`${identity.universityName} — ${identity.campusName}`);

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 28px;background:#1E3A8A;color:#FFFFFF;font-size:12px;font-weight:700;letter-spacing:0.04em;">
          ${safeSchool}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;border-bottom:1px solid #E2E8F0;background:#FFFFFF;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:${priorityAccent};margin-bottom:6px;">
            ${priorityLabel}
          </div>
          <div style="font-size:20px;font-weight:700;line-height:1.3;color:#0F172A;">
            ${safeTitle}
          </div>
          <div style="font-size:13px;color:#64748B;margin-top:8px;">
            ${safeCategory} &middot; ${safeAudience}${safeDate ? ` &middot; Effective ${safeDate}` : ''}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px;font-size:15px;line-height:1.65;color:#1E293B;">
          ${safeBody}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:13px;color:#475569;">
          <div>Posted by <strong>${safeAuthor}</strong> via ${safeSchool}</div>
          <div style="margin-top:12px;">
            <a href="${safePortalUrl}" style="display:inline-block;padding:10px 18px;background:#1E3A8A;color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">
              Open Student & Resident Portal
            </a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export async function dispatchAnnouncementEmail(
  announcement: AnnouncementForEmail,
  triggeredByName: string
): Promise<EmailDispatchRecord> {
  const residents = db
    .prepare(
      `SELECT id, name, email, unit FROM users
       WHERE role IN ('resident', 'teacher') AND status = 'active' AND email_notifications = 1
       ORDER BY created_at DESC`
    )
    .all() as { id: string; name: string; email: string; unit: string }[];

  const identity = getPortalIdentity();
  const priorityPrefix =
    announcement.priority === 'urgent'
      ? '[URGENT] '
      : announcement.priority === 'important'
        ? '[Important] '
        : '';

  const subject = `${priorityPrefix}${announcement.title} — OMSU Mamburao Portal`;
  const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
    ? process.env.APP_URL
    : 'http://localhost:3000';
  const html = buildEmailHtml(announcement, appUrl, identity);
  const text = `${identity.universityName} (${identity.campusName})\n\n${announcement.title}\n${announcement.category} · ${announcement.audience}\n\n${announcement.body}\n\nPosted by ${announcement.authorName}`;

  const smtpReady = isSmtpConfigured();
  const deliveryMode: 'smtp' | 'outbox_preview' = smtpReady ? 'smtp' : 'outbox_preview';
  const summary: DispatchSummaryRow[] = [];

  let deliveredCount = 0;
  let failedCount = 0;

  if (smtpReady && residents.length > 0) {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'bulletin@omsu-mamburao.edu.ph';

    for (const resident of residents) {
      try {
        await transporter.sendMail({
          from: `"${identity.universityName} — Mamburao" <${fromAddress}>`,
          to: resident.email,
          subject,
          text,
          html,
        });
        deliveredCount += 1;
        summary.push({
          email: resident.email,
          name: resident.name,
          unit: resident.unit,
          status: 'sent',
        });
      } catch (err) {
        failedCount += 1;
        summary.push({
          email: resident.email,
          name: resident.name,
          unit: resident.unit,
          status: 'failed',
          error: err instanceof Error ? err.message : 'SMTP delivery error',
        });
      }
    }
  } else {
    for (const resident of residents) {
      deliveredCount += 1;
      summary.push({
        email: resident.email,
        name: resident.name,
        unit: resident.unit,
        status: 'queued_preview',
      });
    }
  }

  const record: EmailDispatchRecord = {
    id: crypto.randomUUID(),
    announcementId: announcement.id,
    announcementTitle: announcement.title,
    triggeredByName,
    recipientCount: residents.length,
    deliveredCount,
    failedCount,
    deliveryMode,
    subject,
    htmlPreview: html,
    recipientsSummary: summary,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO email_dispatches (
      id, announcement_id, announcement_title, triggered_by_name,
      recipient_count, delivered_count, failed_count, delivery_mode,
      subject, html_preview, recipients_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.announcementId,
    record.announcementTitle,
    record.triggeredByName,
    record.recipientCount,
    record.deliveredCount,
    record.failedCount,
    record.deliveryMode,
    record.subject,
    record.htmlPreview,
    JSON.stringify(record.recipientsSummary),
    record.createdAt
  );

  return record;
}
