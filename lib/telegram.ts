const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

/**
 * Send a message to a Telegram chat.
 * Supports Markdown formatting. Silently falls back to plain text if Markdown fails.
 */
export async function sendTelegramMessage(chatId: number | string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });

  // If Markdown parsing fails, retry without parse_mode
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (err?.description?.includes('parse')) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  }

  return res.ok;
}

/**
 * Get the Telegram chat ID for briefing delivery.
 * Uses TELEGRAM_CHAT_ID env var (set for primary user).
 */
export function getTelegramChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID ?? null;
}
