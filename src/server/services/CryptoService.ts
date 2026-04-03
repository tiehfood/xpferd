import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class CryptoService {
  private static instance: CryptoService;
  private key: Buffer;

  private constructor() {
    this.key = this.loadOrCreateKey();
  }

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /** Reset for testing */
  static resetInstance(): void {
    CryptoService.instance = undefined as unknown as CryptoService;
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Store as: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(stored: string): string {
    if (!stored) return '';
    try {
      const parts = stored.split(':');
      if (parts.length !== 3) return '';
      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      const encrypted = Buffer.from(parts[2], 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch {
      console.warn('[CryptoService] Failed to decrypt value — key may have changed');
      return '';
    }
  }

  private loadOrCreateKey(): Buffer {
    // Option 1: Environment variable (hex string, 64 chars = 32 bytes)
    const envKey = process.env.ENCRYPTION_KEY;
    if (envKey) {
      const buf = Buffer.from(envKey, 'hex');
      if (buf.length === KEY_LENGTH) return buf;
      console.warn('[CryptoService] ENCRYPTION_KEY invalid length, falling back to file');
    }

    // Option 2: Key file in data directory
    const keyPath = path.resolve(process.cwd(), 'data/.encryption-key');
    if (fs.existsSync(keyPath)) {
      const hex = fs.readFileSync(keyPath, 'utf8').trim();
      const buf = Buffer.from(hex, 'hex');
      if (buf.length === KEY_LENGTH) return buf;
    }

    // Option 3: Generate new key and save
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const newKey = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 });
    console.log('[CryptoService] Generated new encryption key at', keyPath);
    return newKey;
  }
}
