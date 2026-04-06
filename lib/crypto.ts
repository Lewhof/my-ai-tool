import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  // Use SUPABASE_SERVICE_ROLE_KEY as the encryption key seed (always available)
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CLERK_SECRET_KEY || 'fallback-key-change-me';
  return Buffer.from(seed.padEnd(32, '0').slice(0, 32), 'utf-8');
}

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, content] = encrypted.split(':');
  if (!ivHex || !authTagHex || !content) return encrypted; // Not encrypted, return as-is
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(content, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function maskValue(value: string, type: string): string {
  if (!value) return '****';
  switch (type) {
    case 'card_number':
      return value.length >= 4 ? `**** **** **** ${value.slice(-4)}` : '****';
    case 'pin':
    case 'cvv':
      return '*'.repeat(value.length || 4);
    case 'password':
      return '*'.repeat(Math.min(value.length, 12));
    default:
      if (value.length > 16) return value.slice(0, 8) + '...' + value.slice(-4);
      return '****';
  }
}
