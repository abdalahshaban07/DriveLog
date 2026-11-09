/** Optional AES-GCM envelope for backup files that leave the device. */

export type EncryptedBackup = {
  encrypted: true;
  version: 1;
  /** base64 PBKDF2 salt. */
  salt: string;
  /** base64 AES-GCM nonce. */
  iv: string;
  /** base64 ciphertext. */
  data: string;
};

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const PBKDF2_ITERATIONS = 150_000;

function toBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const o = raw as Record<string, unknown>;
  return (
    o['encrypted'] === true &&
    typeof o['salt'] === 'string' &&
    typeof o['iv'] === 'string' &&
    typeof o['data'] === 'string'
  );
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', ENC.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBackup(plain: string, passphrase: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(plain));
  return {
    encrypted: true,
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(cipher),
  };
}

/** Throws on a wrong passphrase or tampered ciphertext (GCM auth tag). */
export async function decryptBackup(payload: EncryptedBackup, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, fromBase64(payload.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.data),
  );
  return DEC.decode(plain);
}