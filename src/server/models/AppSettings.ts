import type BetterSqlite3 from 'better-sqlite3';
import type { AppSettingsDto } from '../../shared/types';

interface AppSettingsRow {
  id: number;
  locale: string;
  date_format: string;
  number_format: string;
  updated_at: string;
}

const DEFAULTS: AppSettingsDto = {
  locale: 'de-DE',
  dateFormat: 'DD.MM.YYYY',
  numberFormat: 'de-DE',
};

export class AppSettingsModel {
  constructor(private db: BetterSqlite3.Database) {}

  get(): AppSettingsDto {
    const row = this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow | undefined;
    if (!row) {
      // Create default row on first access
      this.db.prepare(
        `INSERT INTO app_settings (id, locale, date_format, number_format) VALUES (1, ?, ?, ?)`
      ).run(DEFAULTS.locale, DEFAULTS.dateFormat, DEFAULTS.numberFormat);
      return { ...DEFAULTS };
    }
    return this.toDto(row);
  }

  update(dto: AppSettingsDto): AppSettingsDto {
    // Ensure row exists
    this.get();
    this.db.prepare(`
      UPDATE app_settings SET
        locale = ?,
        date_format = ?,
        number_format = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(dto.locale, dto.dateFormat, dto.numberFormat);
    return this.get();
  }

  private toDto(row: AppSettingsRow): AppSettingsDto {
    return {
      locale: row.locale,
      dateFormat: row.date_format,
      numberFormat: row.number_format,
    };
  }
}
