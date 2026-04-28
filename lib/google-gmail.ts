import { getGmailToken } from '@/lib/google-gmail-token';

// Server-side Gmail reader. Uses the Gmail v1 REST API directly via fetch
// (no SDK dep) — same pattern as lib/calendar-events.ts uses for Calendar.
//
// All calls are scope-gated through getGmailToken which returns null if the
// account hasn't granted gmail.readonly.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailListItem {
  id: string;
  threadId: string;
  subject: string;
  from: { name: string; email: string };
  date: string;            // ISO datetime
  isRead: boolean;
  preview: string;
  importance: 'high' | 'normal' | 'low';
  hasAttachments: boolean;
}

export interface GmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  date: string;
  body: string;            // HTML if available, else plain text
  bodyType: 'html' | 'text';
  importance: 'high' | 'normal' | 'low';
  hasAttachments: boolean;
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

/**
 * List up to `limit` recent messages in the user's inbox.
 *
 * Cost: 1 list call (5 units) + N parallel get(metadata) calls (5 units each).
 * For a 20-message inbox refresh: 105 quota units. Well under the 15K/min cap.
 */
export async function listInboxMessages(
  userId: string,
  accountId: string,
  opts: { limit?: number; folder?: 'inbox' | 'sent' | 'drafts' | 'archive' } = {},
): Promise<GmailListItem[] | null> {
  const token = await getGmailToken(userId, accountId);
  if (!token) return null;

  const limit = opts.limit ?? 20;
  const folder = opts.folder ?? 'inbox';
  const labelId = folderToLabelId(folder);

  // Step 1: list message ids in the folder.
  const listUrl = `${GMAIL_API}/messages?maxResults=${limit}&labelIds=${labelId}`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) return [];

  const listData = await listRes.json() as { messages?: Array<{ id: string; threadId: string }> };
  const ids = (listData.messages ?? []).map(m => m.id);
  if (ids.length === 0) return [];

  // Step 2: fetch metadata for each message in parallel.
  // We ask for only the headers we need — keeps payload size small.
  const headerParams = '&format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
  const messages = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(`${GMAIL_API}/messages/${id}?${headerParams.slice(1)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return r.json() as Promise<GmailMessage>;
    }),
  );

  return messages
    .filter((m): m is GmailMessage => m !== null)
    .map(toListItem);
}

export async function getMessageDetail(
  userId: string,
  accountId: string,
  messageId: string,
): Promise<GmailDetail | null> {
  const token = await getGmailToken(userId, accountId);
  if (!token) return null;

  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const m = await res.json() as GmailMessage;
  if (!m.payload) return null;

  const headers = m.payload.headers ?? [];
  const subject = headerValue(headers, 'Subject') || '(no subject)';
  const from = parseAddress(headerValue(headers, 'From'));
  const to = parseAddressList(headerValue(headers, 'To'));
  const date = m.internalDate
    ? new Date(parseInt(m.internalDate, 10)).toISOString()
    : (() => {
        const dateHeader = headerValue(headers, 'Date');
        return dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();
      })();

  const { body, bodyType } = extractBody(m.payload);

  return {
    id: m.id,
    threadId: m.threadId,
    subject,
    from,
    to,
    date,
    body,
    bodyType,
    importance: importanceFromLabels(m.labelIds),
    hasAttachments: hasAttachments(m.payload),
  };
}

// ── Mappers ────────────────────────────────────────────────────────────

function toListItem(m: GmailMessage): GmailListItem {
  const headers = m.payload?.headers ?? [];
  const subject = headerValue(headers, 'Subject') || '(no subject)';
  const from = parseAddress(headerValue(headers, 'From'));
  // Prefer Gmail's internalDate (epoch ms, server-anchored) over the Date
  // header — header timezones are inconsistent and would scramble the
  // combined-inbox sort order.
  const date = m.internalDate
    ? new Date(parseInt(m.internalDate, 10)).toISOString()
    : (() => {
        const dateHeader = headerValue(headers, 'Date');
        return dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();
      })();

  return {
    id: m.id,
    threadId: m.threadId,
    subject,
    from,
    date,
    isRead: !(m.labelIds ?? []).includes('UNREAD'),
    preview: m.snippet ?? '',
    importance: importanceFromLabels(m.labelIds),
    hasAttachments: hasAttachments(m.payload),
  };
}

// ── MIME walking + decoding ────────────────────────────────────────────

// Skip parts whose body claims to exceed this size — defense against
// memory blow-up on Vercel's hobby tier (50MB function limit). 2MB per
// part covers virtually all legitimate emails.
const MAX_PART_BYTES = 2_000_000;
// Cap total accumulated body length so a 100-part newsletter can't
// concatenate into a function-killing string.
const MAX_BODY_CHARS = 5_000_000;

/**
 * Walk payload.parts to find the best body part.
 * Preference: text/html first, fall back to text/plain.
 * Body data is base64url-encoded — decode and return as a utf-8 string.
 */
function extractBody(payload: GmailPart): { body: string; bodyType: 'html' | 'text' } {
  // Single-part message
  if (!payload.parts && payload.body?.data) {
    if ((payload.body.size ?? 0) > MAX_PART_BYTES) return { body: '', bodyType: 'text' };
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') return { body: clamp(decoded), bodyType: 'html' };
    return { body: clamp(decoded), bodyType: 'text' };
  }

  // Multi-part — collect all text/html and text/plain parts (recursively).
  const html: string[] = [];
  const text: string[] = [];
  walk(payload, html, text);

  if (html.length > 0) return { body: clamp(html.join('\n\n')), bodyType: 'html' };
  if (text.length > 0) return { body: clamp(text.join('\n\n')), bodyType: 'text' };
  return { body: '', bodyType: 'text' };
}

function walk(part: GmailPart, htmlAcc: string[], textAcc: string[]): void {
  if (part.parts && part.parts.length > 0) {
    for (const sub of part.parts) walk(sub, htmlAcc, textAcc);
    return;
  }
  if (!part.body?.data) return;
  if ((part.body.size ?? 0) > MAX_PART_BYTES) return;  // skip oversize parts
  if (part.mimeType === 'text/html') htmlAcc.push(decodeBase64Url(part.body.data));
  else if (part.mimeType === 'text/plain') textAcc.push(decodeBase64Url(part.body.data));
}

function clamp(s: string): string {
  return s.length > MAX_BODY_CHARS ? s.slice(0, MAX_BODY_CHARS) + '\n\n[…body truncated]' : s;
}

function hasAttachments(payload?: GmailPart): boolean {
  if (!payload) return false;
  if (payload.filename && payload.body?.attachmentId) return true;
  if (payload.parts) return payload.parts.some(hasAttachments);
  return false;
}

/**
 * Gmail returns base64url-encoded body data. Convert to standard base64,
 * then to a utf-8 string via Buffer (Node runtime).
 */
function decodeBase64Url(s: string): string {
  const standard = s.replace(/-/g, '+').replace(/_/g, '/');
  const padding = standard.length % 4 === 0 ? '' : '='.repeat(4 - (standard.length % 4));
  try {
    return Buffer.from(standard + padding, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

// ── Header helpers ─────────────────────────────────────────────────────

function headerValue(headers: GmailHeader[], name: string): string {
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return '';
}

/**
 * Parse an RFC-5322 mailbox address. Accepts both:
 *   "Display Name" <email@example.com>
 *   email@example.com
 *
 * Non-greedy on the leading `.*?` so a hostile `Foo <a@b> <evil@x>` resolves
 * with name=`Foo` and email=`a@b` rather than swallowing the first bracket.
 * Strips control chars from both name and email before returning.
 */
function parseAddress(raw: string): { name: string; email: string } {
  if (!raw) return { name: '', email: '' };
  const cleaned = raw.replace(/[\r\n\0]/g, '').trim();
  const angle = cleaned.match(/^(.*?)<([^<>]+)>\s*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, '').replace(/^"(.*)"$/, '$1').trim();
    return { name, email: angle[2].trim() };
  }
  return { name: '', email: cleaned };
}

/**
 * Quote-aware comma splitter — RFC-5322 lets display names contain commas
 * inside quotes (`"Doe, Jane" <jane@x.com>`). A naive split corrupts those.
 * Tracks an in-quotes flag and an angle-bracket depth; only splits on commas
 * outside both. Drops entries that don't look like an `@`-bearing address
 * (e.g. group syntax `undisclosed-recipients:;`).
 */
function parseAddressList(raw: string): Array<{ name: string; email: string }> {
  if (!raw) return [];
  const parts: string[] = [];
  let buf = '';
  let inQuotes = false;
  let angleDepth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && raw[i - 1] !== '\\') { inQuotes = !inQuotes; buf += ch; continue; }
    if (!inQuotes && ch === '<') { angleDepth++; buf += ch; continue; }
    if (!inQuotes && ch === '>') { angleDepth = Math.max(0, angleDepth - 1); buf += ch; continue; }
    if (!inQuotes && angleDepth === 0 && ch === ',') {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts
    .map(p => parseAddress(p))
    .filter(a => a.email && a.email.includes('@'));
}

function importanceFromLabels(labelIds?: string[]): 'high' | 'normal' | 'low' {
  if (!labelIds) return 'normal';
  if (labelIds.includes('IMPORTANT')) return 'high';
  return 'normal';
}

function folderToLabelId(folder: 'inbox' | 'sent' | 'drafts' | 'archive'): string {
  switch (folder) {
    case 'sent': return 'SENT';
    case 'drafts': return 'DRAFT';
    case 'archive': return 'CATEGORY_PERSONAL';  // closest approximation; Gmail has no "archive" label
    case 'inbox':
    default: return 'INBOX';
  }
}
