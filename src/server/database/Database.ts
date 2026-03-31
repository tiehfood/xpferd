import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class Database {
  private static instance: Database;
  private db: BetterSqlite3.Database;

  private constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.resolve(process.cwd(), 'data/xrechnung.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new BetterSqlite3(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.createSchema();
  }

  static getInstance(dbPath?: string): Database {
    if (!Database.instance) {
      Database.instance = new Database(dbPath);
    }
    return Database.instance;
  }

  static resetInstance(): void {
    if (Database.instance) {
      Database.instance.db.close();
      Database.instance = undefined as unknown as Database;
    }
  }

  getDb(): BetterSqlite3.Database {
    return this.db;
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),

        -- Header (BG-1)
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        invoice_type_code TEXT NOT NULL DEFAULT '380',
        currency_code TEXT NOT NULL DEFAULT 'EUR',
        due_date TEXT,
        buyer_reference TEXT NOT NULL DEFAULT '',

        -- Seller (BG-4)
        seller_name TEXT NOT NULL,
        seller_street TEXT NOT NULL,
        seller_city TEXT NOT NULL,
        seller_postal_code TEXT NOT NULL,
        seller_country_code TEXT NOT NULL DEFAULT 'DE',
        seller_vat_id TEXT,
        seller_tax_number TEXT,
        seller_contact_name TEXT,
        seller_contact_phone TEXT,
        seller_contact_email TEXT,

        -- Buyer (BG-7)
        buyer_name TEXT NOT NULL,
        buyer_street TEXT NOT NULL,
        buyer_city TEXT NOT NULL,
        buyer_postal_code TEXT NOT NULL,
        buyer_country_code TEXT NOT NULL DEFAULT 'DE',
        buyer_vat_id TEXT,
        buyer_email TEXT,

        -- Payment (BG-16)
        payment_means_code TEXT NOT NULL DEFAULT '58',
        payment_terms TEXT,
        iban TEXT,
        bic TEXT,

        -- Tax (BG-23)
        tax_category_code TEXT NOT NULL DEFAULT 'S',
        tax_rate REAL NOT NULL DEFAULT 19.0,

        -- Kleinunternehmerregelung (§19 UStG)
        kleinunternehmer INTEGER NOT NULL DEFAULT 0,

        -- Totals (BG-22)
        total_net_amount REAL NOT NULL DEFAULT 0,
        total_tax_amount REAL NOT NULL DEFAULT 0,
        total_gross_amount REAL NOT NULL DEFAULT 0,
        amount_due REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS invoice_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_code TEXT NOT NULL DEFAULT 'C62',
        item_name TEXT NOT NULL,
        net_price REAL NOT NULL DEFAULT 0,
        vat_category_code TEXT NOT NULL DEFAULT 'S',
        vat_rate REAL NOT NULL DEFAULT 19.0,
        line_net_amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

      CREATE TABLE IF NOT EXISTS invoice_number_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        digits INTEGER NOT NULL DEFAULT 4,
        next_number INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS payment_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        payment_means_code TEXT NOT NULL DEFAULT '58',
        iban TEXT,
        bic TEXT,
        payment_terms TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS line_item_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit_code TEXT NOT NULL DEFAULT 'C62',
        net_price REAL NOT NULL DEFAULT 0,
        vat_category_code TEXT NOT NULL DEFAULT 'S',
        vat_rate REAL NOT NULL DEFAULT 19.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS invoice_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pdf_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        page_size TEXT NOT NULL DEFAULT 'a4',
        orientation TEXT NOT NULL DEFAULT 'portrait',
        blocks TEXT NOT NULL DEFAULT '[]',
        guide_lines TEXT NOT NULL DEFAULT '[]',
        logo_data TEXT,
        logo_mime_type TEXT,
        custom_fonts TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('seller', 'buyer')),
        name TEXT NOT NULL,
        street TEXT NOT NULL,
        city TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        country_code TEXT NOT NULL DEFAULT 'DE',
        vat_id TEXT,
        tax_number TEXT,
        contact_name TEXT,
        contact_phone TEXT,
        contact_email TEXT,
        email TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        locale TEXT NOT NULL DEFAULT 'de-DE',
        date_format TEXT NOT NULL DEFAULT 'DD.MM.YYYY',
        number_format TEXT NOT NULL DEFAULT 'de-DE',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recurring_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        invoice_template_id INTEGER NOT NULL,
        invoice_number_template_id INTEGER,
        frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly','quarterly')),
        day_of_week INTEGER,
        day_of_month INTEGER,
        month_position TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        due_date_offset_days INTEGER NOT NULL DEFAULT 30,
        delivery_date_offset_days INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        last_generated_date TEXT,
        next_scheduled_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_template_id) REFERENCES invoice_templates(id)
      );

      CREATE TABLE IF NOT EXISTS recurring_invoice_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recurring_invoice_id INTEGER NOT NULL,
        invoice_id INTEGER,
        scheduled_date TEXT NOT NULL,
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL CHECK(status IN ('success','error')),
        error_message TEXT,
        FOREIGN KEY (recurring_invoice_id) REFERENCES recurring_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      );
    `);

    // Column migrations — ALTER TABLE IF NOT EXISTS is not supported by SQLite,
    // so we attempt each addition and silently ignore "duplicate column" errors.
    const addColumnIfMissing = (table: string, column: string, definition: string) => {
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      } catch {
        // Column already exists — ignore
      }
    };

    addColumnIfMissing('pdf_templates', 'custom_fonts', 'TEXT');
    addColumnIfMissing('pdf_templates', 'guide_lines', "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing('pdf_templates', 'margin_left',   'REAL DEFAULT 2.5');
    addColumnIfMissing('pdf_templates', 'margin_right',  'REAL DEFAULT 2.5');
    addColumnIfMissing('pdf_templates', 'margin_top',    'REAL DEFAULT 2.5');
    addColumnIfMissing('pdf_templates', 'margin_bottom', 'REAL DEFAULT 2.5');

    // Invoice field migrations (Tier 1+2 — EN 16931)
    addColumnIfMissing('invoices', 'note', 'TEXT');
    addColumnIfMissing('invoices', 'delivery_date', 'TEXT');
    addColumnIfMissing('invoices', 'order_reference', 'TEXT');
    addColumnIfMissing('invoices', 'contract_reference', 'TEXT');
    addColumnIfMissing('invoices', 'payment_reference', 'TEXT');
    addColumnIfMissing('invoices', 'account_name', 'TEXT');
    addColumnIfMissing('invoices', 'prepaid_amount', 'REAL DEFAULT 0');
    addColumnIfMissing('invoice_lines', 'item_description', 'TEXT');
    addColumnIfMissing('invoices', 'auto_generated', 'INTEGER NOT NULL DEFAULT 0');
  }
}
