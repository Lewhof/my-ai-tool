import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM encryption for Vault field values.
// Key: VAULT_ENCRYPTION_KEY (base64-encoded 32 bytes).
// Ciphertext format: `v2:<ivHex>:<authTagHex>:<contentHex>`

const ALGORITHM = 'aes-256-gcm';
const V2_PREFIX = 'v2:';

function getVaultKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'VAULT_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `VAULT_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Use: openssl rand -base64 32`,
    );
  }
  return key;
}

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getVaultKey(), iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${V2_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  if (!encrypted.startsWith(V2_PREFIX)) return encrypted;
  const payload = encrypted.slice(V2_PREFIX.length);
  const [ivHex, authTagHex, content] = payload.split(':');
  if (!ivHex || !authTagHex || !content) return encrypted;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getVaultKey(), iv);
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
