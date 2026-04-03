import type BetterSqlite3 from 'better-sqlite3';
import type { EmailSettingsDto } from '../../shared/types/index.js';
import { CryptoService } from '../services/CryptoService.js';

interface EmailSettingsRow {
  id: number;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  smtp_user: string;
  smtp_pass: string;
  from_address: string;
  from_name: string | null;
  reply_to: string | null;
  updated_at: string;
}

const DEFAULTS: Omit<EmailSettingsDto, 'smtpPass'> & { smtpPass: string } = {
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromAddress: '',
  fromName: undefined,
  replyTo: undefined,
};

export class EmailSettingsModel {
  constructor(private db: BetterSqlite3.Database) {}

  get(): EmailSettingsDto {
    const row = this.db
      .prepare('SELECT * FROM email_settings WHERE id = 1')
      .get() as EmailSettingsRow | undefined;

    if (!row) {
      this.db.prepare(`
        INSERT INTO email_settings (id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_address)
        VALUES (1, '', 587, 0, '', '', '')
      `).run();
      return { ...DEFAULTS };
    }

    return this.toDto(row);
  }

  update(dto: EmailSettingsDto): EmailSettingsDto {
    // Ensure row exists
    this.get();
    const encryptedPass = CryptoService.getInstance().encrypt(dto.smtpPass);
    this.db.prepare(`
      UPDATE email_settings SET
        smtp_host = ?,
        smtp_port = ?,
        smtp_secure = ?,
        smtp_user = ?,
        smtp_pass = ?,
        from_address = ?,
        from_name = ?,
        reply_to = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      dto.smtpHost,
      dto.smtpPort,
      dto.smtpSecure ? 1 : 0,
      dto.smtpUser,
      encryptedPass,
      dto.fromAddress,
      dto.fromName ?? null,
      dto.replyTo ?? null,
    );
    return this.get();
  }

  private toDto(row: EmailSettingsRow): EmailSettingsDto {
    return {
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      smtpSecure: row.smtp_secure === 1,
      smtpUser: row.smtp_user,
      smtpPass: CryptoService.getInstance().decrypt(row.smtp_pass),
      fromAddress: row.from_address,
      fromName: row.from_name ?? undefined,
      replyTo: row.reply_to ?? undefined,
    };
  }
}
