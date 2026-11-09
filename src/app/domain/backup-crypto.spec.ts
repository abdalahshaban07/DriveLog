import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { decryptBackup, encryptBackup, isEncryptedBackup } from './backup-crypto';

// jsdom may not expose SubtleCrypto; Node's webcrypto is API-identical.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    globalThis.crypto = webcrypto as unknown as Crypto;
  }
});

describe('backup crypto envelope', () => {
  const plain = JSON.stringify({ version: 7, fillUps: [{ id: 'f1', liters: 40 }] });

  it('round-trips a backup with the right passphrase', async () => {
    const envelope = await encryptBackup(plain, 'correct horse');
    expect(envelope.encrypted).toBe(true);
    expect(envelope.data).not.toContain('fillUps');
    const restored = await decryptBackup(envelope, 'correct horse');
    expect(restored).toBe(plain);
  });

  it('produces a different ciphertext each time (random salt + iv)', async () => {
    const a = await encryptBackup(plain, 'pass');
    const b = await encryptBackup(plain, 'pass');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects a wrong passphrase', async () => {
    const envelope = await encryptBackup(plain, 'right');
    await expect(decryptBackup(envelope, 'wrong')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const envelope = await encryptBackup(plain, 'pass');
    const bytes = Uint8Array.from(atob(envelope.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered = { ...envelope, data: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptBackup(tampered, 'pass')).rejects.toThrow();
  });

  it('handles unicode payloads', async () => {
    const text = '{"nickname":"عربيتي","note":"-tank ✓"}';
    const envelope = await encryptBackup(text, 'كلمة السر');
    expect(await decryptBackup(envelope, 'كلمة السر')).toBe(text);
  });
});

describe('isEncryptedBackup', () => {
  it('recognizes a well-formed envelope', async () => {
    const envelope = await encryptBackup('{}', 'pass');
    expect(isEncryptedBackup(envelope)).toBe(true);
    expect(isEncryptedBackup(JSON.parse(JSON.stringify(envelope)))).toBe(true);
  });

  it('rejects plain backups and malformed shapes', () => {
    expect(isEncryptedBackup(null)).toBe(false);
    expect(isEncryptedBackup({ version: 7, fillUps: [] })).toBe(false);
    expect(isEncryptedBackup({ encrypted: true })).toBe(false);
    expect(isEncryptedBackup({ encrypted: true, salt: 1, iv: 'a', data: 'b' })).toBe(false);
  });
});