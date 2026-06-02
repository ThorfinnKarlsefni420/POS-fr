// AES-256-GCM encryption for integration credentials stored in the database.
// Protects clientSecret and API tokens from plain-text DB exposure.
//
// Required env var: CREDENTIALS_ENCRYPTION_KEY
//   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   Add the resulting 64-char hex string to apps/api/.env

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // 96-bit IV — recommended for GCM

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set');
  if (raw.length === 64) return Buffer.from(raw, 'hex');   // 32-byte hex string
  if (raw.length === 32) return Buffer.from(raw, 'utf8');  // raw 32-char string
  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes raw or 64 hex chars');
}

interface EncryptedEnvelope {
  __enc: true;
  iv: string;
  tag: string;
  ct: string;
}

export function encryptCredentials(data: Record<string, unknown>): EncryptedEnvelope {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(data);
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return {
    __enc: true,
    iv:  iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ct:  ct.toString('hex'),
  };
}

export function decryptCredentials(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;

  // Plaintext (pre-encryption or key not yet configured) — return as-is
  if (!obj.__enc) {
    if (Object.keys(obj).length > 0) {
      console.warn('[credentials-crypto] Credentials are stored unencrypted. Save them again to encrypt.');
    }
    return obj;
  }

  const key = getKey();
  const iv  = Buffer.from(String(obj.iv),  'hex');
  const tag = Buffer.from(String(obj.tag), 'hex');
  const ct  = Buffer.from(String(obj.ct),  'hex');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
