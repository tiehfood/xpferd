import type BetterSqlite3 from 'better-sqlite3';
import type { PdfTemplateDto, PdfBlockDto } from '../../shared/types';

interface Row {
  id: number;
  name: string;
  page_size: string;
  orientation: string;
  blocks: string;
  guide_lines: string;
  logo_data: string | null;
  logo_mime_type: string | null;
  custom_fonts: string | null;
  margin_left: number | null;
  margin_right: number | null;
  margin_top: number | null;
  margin_bottom: number | null;
  created_at: string;
  updated_at: string;
}

export class PdfTemplateModel {
  constructor(private db: BetterSqlite3.Database) {}

  findAll(): PdfTemplateDto[] {
    const rows = this.db.prepare('SELECT * FROM pdf_templates ORDER BY name').all() as Row[];
    return rows.map(this.toDto);
  }

  findById(id: number): PdfTemplateDto | null {
    const row = this.db.prepare('SELECT * FROM pdf_templates WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toDto(row) : null;
  }

  create(dto: PdfTemplateDto): PdfTemplateDto {
    const result = this.db.prepare(`
      INSERT INTO pdf_templates (name, page_size, orientation, blocks, guide_lines, logo_data, logo_mime_type, custom_fonts, margin_left, margin_right, margin_top, margin_bottom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dto.name,
      dto.pageSize,
      dto.orientation,
      JSON.stringify(dto.blocks),
      JSON.stringify(dto.guideLines ?? []),
      dto.logoData ?? null,
      dto.logoMimeType ?? null,
      dto.customFonts ? JSON.stringify(dto.customFonts) : null,
      dto.marginLeft ?? 2.5,
      dto.marginRight ?? 2.5,
      dto.marginTop ?? 2.5,
      dto.marginBottom ?? 2.5,
    );
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, dto: PdfTemplateDto): PdfTemplateDto | null {
    if (!this.findById(id)) return null;
    this.db.prepare(`
      UPDATE pdf_templates SET
        name = ?, page_size = ?, orientation = ?, blocks = ?, guide_lines = ?,
        logo_data = ?, logo_mime_type = ?, custom_fonts = ?,
        margin_left = ?, margin_right = ?, margin_top = ?, margin_bottom = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      dto.name,
      dto.pageSize,
      dto.orientation,
      JSON.stringify(dto.blocks),
      JSON.stringify(dto.guideLines ?? []),
      dto.logoData ?? null,
      dto.logoMimeType ?? null,
      dto.customFonts ? JSON.stringify(dto.customFonts) : null,
      dto.marginLeft ?? 2.5,
      dto.marginRight ?? 2.5,
      dto.marginTop ?? 2.5,
      dto.marginBottom ?? 2.5,
      id,
    );
    return this.findById(id)!;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM pdf_templates WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private toDto(row: Row): PdfTemplateDto {
    const guideLines = row.guide_lines ? JSON.parse(row.guide_lines) : [];
    // Backward-compat: migrate legacy 'logo' block type to 'image'
    const rawBlocks: PdfBlockDto[] = JSON.parse(row.blocks);
    const blocks = rawBlocks.map(b => b.type === ('logo' as string) ? { ...b, type: 'image' as const } : b);
    const customFonts = row.custom_fonts ? JSON.parse(row.custom_fonts) : undefined;
    return {
      id: row.id,
      name: row.name,
      pageSize: row.page_size as 'a4' | 'letter',
      orientation: row.orientation as 'portrait' | 'landscape',
      blocks,
      guideLines: guideLines.length > 0 ? guideLines : undefined,
      logoData: row.logo_data ?? undefined,
      logoMimeType: row.logo_mime_type ?? undefined,
      customFonts,
      marginLeft: row.margin_left ?? 2.5,
      marginRight: row.margin_right ?? 2.5,
      marginTop: row.margin_top ?? 2.5,
      marginBottom: row.margin_bottom ?? 2.5,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
