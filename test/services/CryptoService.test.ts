import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CryptoService } from '../../src/server/services/CryptoService.js';

describe('CryptoService', () => {
  beforeAll(() => {
    // Use env-based key so no key file is created during tests
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes as hex
    CryptoService.resetInstance();
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
    CryptoService.resetInstance();
  });

  it('singleton returns the same instance', () => {
    const a = CryptoService.getInstance();
    const b = CryptoService.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance causes new instance to be created', () => {
    const first = CryptoService.getInstance();
    CryptoService.resetInstance();
    // restore key so next getInstance uses env
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const second = CryptoService.getInstance();
    expect(first).not.toBe(second);
  });

  it('encrypt returns non-empty string', () => {
    const svc = CryptoService.getInstance();
    const result = svc.encrypt('secret');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('encrypt output has exactly three colon-separated parts (iv:authTag:ciphertext)', () => {
    const svc = CryptoService.getInstance();
    const result = svc.encrypt('my-password');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    // All three parts must be non-empty base64 strings
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('decrypt reverses encrypt (round-trip)', () => {
    const svc = CryptoService.getInstance();
    const plaintext = 'super-secret-password-123!';
    const encrypted = svc.encrypt(plaintext);
    const decrypted = svc.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypting the same value twice produces different ciphertexts (random IV)', () => {
    const svc = CryptoService.getInstance();
    const plaintext = 'same-input';
    const first = svc.encrypt(plaintext);
    const second = svc.encrypt(plaintext);
    // Same plaintext → different ciphertext due to random IV
    expect(first).not.toBe(second);
    // But both decrypt to the same value
    expect(svc.decrypt(first)).toBe(plaintext);
    expect(svc.decrypt(second)).toBe(plaintext);
  });

  it('encrypt of empty string returns empty string', () => {
    const svc = CryptoService.getInstance();
    expect(svc.encrypt('')).toBe('');
  });

  it('decrypt of empty string returns empty string', () => {
    const svc = CryptoService.getInstance();
    expect(svc.decrypt('')).toBe('');
  });

  it('decrypt of garbage string returns empty string (graceful failure)', () => {
    const svc = CryptoService.getInstance();
    expect(svc.decrypt('this-is-not-valid-base64:garbage:data')).toBe('');
  });

  it('decrypt of string with wrong number of parts returns empty string', () => {
    const svc = CryptoService.getInstance();
    expect(svc.decrypt('only-two:parts')).toBe('');
    expect(svc.decrypt('four:parts:too:many')).toBe('');
  });

  it('decrypt of tampered ciphertext returns empty string (auth tag mismatch)', () => {
    const svc = CryptoService.getInstance();
    const encrypted = svc.encrypt('original-data');
    const parts = encrypted.split(':');
    // Tamper with the ciphertext part (index 2)
    const tamperedCiphertext = Buffer.from('tampered-ciphertext').toString('base64');
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;
    expect(svc.decrypt(tampered)).toBe('');
  });

  it('decrypt of valid format but tampered auth tag returns empty string', () => {
    const svc = CryptoService.getInstance();
    const encrypted = svc.encrypt('original-data');
    const parts = encrypted.split(':');
    // Tamper with the auth tag (index 1)
    const fakeAuthTag = Buffer.alloc(16, 0xff).toString('base64');
    const tampered = `${parts[0]}:${fakeAuthTag}:${parts[2]}`;
    expect(svc.decrypt(tampered)).toBe('');
  });

  it('handles unicode passwords correctly', () => {
    const svc = CryptoService.getInstance();
    const unicodePass = 'Passw0rd-äöü-€-🔐';
    const encrypted = svc.encrypt(unicodePass);
    const decrypted = svc.decrypt(encrypted);
    expect(decrypted).toBe(unicodePass);
  });

  it('handles long passwords correctly', () => {
    const svc = CryptoService.getInstance();
    const longPass = 'x'.repeat(500);
    const encrypted = svc.encrypt(longPass);
    expect(svc.decrypt(encrypted)).toBe(longPass);
  });
});
