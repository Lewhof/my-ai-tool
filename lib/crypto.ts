import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM encryption for Vault field values.
//
// Key source:
//   - NEW writes always use VAULT_ENCRYPTION_KEY (base64-encoded 32 bytes).
//     Throws at runtime if the env var is missing or the wrong length —
//     we do NOT want silent fallback to a weaker key for new ciphertext.
//   - LEGACY reads of pre-v2 ciphertext use a key derived from
//     SUPABASE_SERVICE_ROLE_KEY (padded to 32 ASCII bytes). This path
//     exists only to unblock the one-shot re-encryption migration and
//     should be removed once all rows are in v2 format.
//
// Ciphertext formats:
//   - v2:    `v2:<ivHex>:<authTagHex>:<contentHex>`
//   - legacy:    `<ivHex>:<authTagHex>:<contentHex>`  (3 colon-separated parts)

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

// Legacy seed — used ONLY to decrypt pre-v2 ciphertext during migration.
// TODO: remove after all vault_keys rows are confirmed converted to v2.
function getLegacyKey(): Buffer {
  const seed =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CLERK_SECRET_KEY ||
    'fallback-key-change-me';
  return Buffer.from(seed.padEnd(32, '0').slice(0, 32), 'utf-8');
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
  if (encrypted.startsWith(V2_PREFIX)) {
    return decryptWithKey(encrypted.slice(V2_PREFIX.length), getVaultKey());
  }
  // Legacy 3-part format; passthrough if it doesn't look encrypted at all.
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  return decryptWithKey(encrypted, getLegacyKey());
}

function decryptWithKey(encrypted: string, key: Buffer): string {
  const [ivHex, authTagHex, content] = encrypted.split(':');
  if (!ivHex || !authTagHex || !content) return encrypted;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
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
