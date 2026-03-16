import { PDF, rgb, measureText } from '@libpdf/core';
import type { PDFPage, RGB, Standard14FontName, EmbeddedFont, FontInput } from '@libpdf/core';
import type { PdfTemplateDto, PdfBlockDto, InvoiceDto } from '../../shared/types';
import { UNIT_CODES, PAYMENT_MEANS_CODES, KLEINUNTERNEHMER_NOTE } from '../../shared/constants/index.js';
import { formatIban, fmtDate } from '../../shared/constants/format.js';
import { AppSettingsService } from './AppSettingsService.js';
export { computeBlockContentHeight } from '../../shared/utils/blockMetrics.js';
import { SvgToPdfRenderer } from './SvgToPdfRenderer.js';

const PAGE_SIZES = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
} as const;

const DEFAULT_FONT_SIZE = 10;
const DEFAULT_FONT_COLOR = '#1c1b18';

// Helvetica (regular) character widths (1/1000 units per em) — URW Nimbus Sans Regular metrics as used by pdfjs.
// LibPDF does not embed /Widths in font dict, so viewers use their built-in substitute metrics.
// Values empirically calibrated against pdfjs-dist per-character width measurements.
const HELVETICA_CHAR_WIDTHS: Record<number, number> = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556,
  112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722,
  120: 500, 121: 500, 122: 500, 123: 389, 124: 280, 125: 389, 126: 584,
  196: 667, 214: 778, 220: 722, // Ä Ö Ü
  228: 556, 246: 556, 252: 556, // ä ö ü
  223: 611, // ß
  8364: 556, // €
};

// Helvetica-Bold character widths (1/1000 units per em) — URW Nimbus Sans Bold metrics as used by pdfjs.
// Empirically calibrated against pdfjs-dist per-character width measurements.
const HELVETICA_BOLD_CHAR_WIDTHS: Record<number, number> = {
  32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
  64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
  96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333, 103: 611,
  104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611, 111: 611,
  112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611, 118: 556, 119: 778,
  120: 556, 121: 556, 122: 500, 123: 389, 124: 280, 125: 389, 126: 584,
  196: 722, 214: 778, 220: 722, // Ä Ö Ü
  228: 556, 246: 611, 252: 611, // ä ö ü
  223: 611, // ß
  8364: 556, // €
};

export function measureHelveticaWidth(text: string, fontSize: number, font: Standard14FontName = 'Helvetica'): number {
  const table = font === 'Helvetica-Bold' ? HELVETICA_BOLD_CHAR_WIDTHS : HELVETICA_CHAR_WIDTHS;
  let total = 0;
  for (const char of text) {
    total += table[char.codePointAt(0) ?? 0] ?? 500;
  }
  return (total / 1000) * fontSize;
}

export class PdfRenderService {
  private get settingsService() {
    return new AppSettingsService();
  }

  async render(template: PdfTemplateDto, invoice: InvoiceDto): Promise<Uint8Array> {
    const pdf = PDF.create();

    const size = PAGE_SIZES[template.pageSize] ?? PAGE_SIZES.a4;
    const isLandscape = template.orientation === 'landscape';
    const pageWidth = isLandscape ? size.height : size.width;
    const pageHeight = isLandscape ? size.width : size.height;

    // Embed custom fonts — store regular + optional bold EmbeddedFont objects
    const fontMap = new Map<string, { regular: EmbeddedFont; bold?: EmbeddedFont }>();
    if (template.customFonts && template.customFonts.length > 0) {
      for (const cf of template.customFonts) {
        try {
          const regular = pdf.embedFont(new Uint8Array(Buffer.from(cf.data, 'base64')));
          const bold = cf.dataBold
            ? pdf.embedFont(new Uint8Array(Buffer.from(cf.dataBold, 'base64')))
            : undefined;
          fontMap.set(cf.name, { regular, bold });
        } catch (err) {
          console.error(`Custom font embedding failed for "${cf.name}":`, err);
        }
      }
    }

    pdf.addPage({
      size: template.pageSize,
      ...(isLandscape ? { orientation: 'landscape' } : {}),
    });
    const page = pdf.getPage(0)!;

    for (const block of template.blocks) {
      this.renderBlock(pdf, page, block, invoice, template, pageHeight, fontMap);
    }

    return await pdf.save();
  }

  private renderBlock(
    pdf: PDF,
    page: PDFPage,
    block: PdfBlockDto,
    invoice: InvoiceDto,
    template: PdfTemplateDto,
    pageHeight: number,
    fontMap: Map<string, { regular: EmbeddedFont; bold?: EmbeddedFont }> = new Map(),
  ): void {
    const fontSize = block.fontSize ?? DEFAULT_FONT_SIZE;
    const color = this.parseColor(block.fontColor ?? DEFAULT_FONT_COLOR);
    // Select font: prefer custom font entry, respecting fontWeight when bold variant exists
    const entry = block.fontFamily ? fontMap.get(block.fontFamily) : undefined;
    const font: FontInput = entry
      ? (block.fontWeight === 'bold' && entry.bold ? entry.bold : entry.regular)
      : (block.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica');
    // Bold font for components that always bold the last/emphasis row (e.g. Bruttobetrag)
    const boldFont: FontInput = entry
      ? (entry.bold ?? entry.regular)   // prefer bold variant; fall back to regular
      : 'Helvetica-Bold';

    // Y-coordinate: CSS is top-left origin (y-down), PDF is bottom-left (y-up).
    //
    // Convention: block.y = TOP of block in CSS coords.
    //
    // - Image/Line:    pdfY = pageHeight - block.y - block.height (image drawn from block bottom)
    // - Table/Totals:  pdfY = pageHeight - block.y (draws downward from block top)
    // - Text blocks:   pdfY = pageHeight - block.y - fontSize
    //                  First baseline lands at CSS position block.y + fontSize.
    let pdfY: number;
    if (block.type === 'image' || block.type === 'line') {
      pdfY = pageHeight - block.y - block.height;
    } else if (block.type === 'lines-table' || block.type === 'totals') {
      pdfY = pageHeight - block.y;
    } else {
      pdfY = pageHeight - block.y - fontSize;
    }

    // Content override: if block.content is set, render it directly (except image, line, lines-table, free-text)
    if (block.content && !['image', 'line', 'lines-table', 'free-text'].includes(block.type)) {
      const padL = block.paddingLeft ?? 0;
      const padR = block.paddingRight ?? 0;
      page.drawText(block.content, {
        x: block.x + padL, y: pdfY, font, size: fontSize, color,
        maxWidth: block.width - padL - padR, lineHeight: fontSize * 1.4,
      });
      return;
    }

    switch (block.type) {
      case 'seller-address':
        this.drawSellerAddress(page, block, invoice, pdfY, fontSize, color, font);
        break;
      case 'buyer-address':
        this.drawBuyerAddress(page, block, invoice, pdfY, fontSize, color, font);
        break;
      case 'invoice-header':
        this.drawInvoiceHeader(page, block, invoice, pdfY, fontSize, color, font);
        break;
      case 'lines-table':
        this.drawLinesTable(page, block, invoice, pdfY, pageHeight, fontSize, color, font, boldFont);
        break;
      case 'totals':
        this.drawTotals(page, block, invoice, pdfY, fontSize, color, font, boldFont);
        break;
      case 'payment-info':
        this.drawPaymentInfo(page, block, invoice, pdfY, fontSize, color, font);
        break;
      case 'free-text':
        this.drawFreeText(page, block, pdfY, fontSize, color, font);
        break;
      case 'image':
        this.drawImage(pdf, page, block, template, pdfY);
        break;
      case 'line':
        this.drawLineElement(page, block, pdfY);
        break;
      case 'invoice-title':
        this.drawSimpleText(page, block, 'Rechnung', pdfY, fontSize + 4, color, font);
        break;
      case 'invoice-number':
        this.drawLV(page, block, 'Nr.:', invoice.invoiceNumber, pdfY, fontSize, color, font);
        break;
      case 'invoice-date':
        this.drawLV(page, block, 'Datum:', this.formatDate(invoice.invoiceDate), pdfY, fontSize, color, font);
        break;
      case 'due-date':
        if (invoice.dueDate) {
          this.drawLV(page, block, 'Fällig:', this.formatDate(invoice.dueDate), pdfY, fontSize, color, font);
        }
        break;
      case 'buyer-reference':
        if (invoice.buyerReference) {
          this.drawLV(page, block, 'Referenz:', invoice.buyerReference, pdfY, fontSize, color, font);
        }
        break;
      case 'total-net':
        this.drawLV(page, block,
          invoice.kleinunternehmer ? 'Rechnungssumme:' : 'Nettobetrag:',
          this.formatCurrency(invoice.totalNetAmount ?? 0), pdfY, fontSize, color, font);
        break;
      case 'total-tax':
        if (!invoice.kleinunternehmer) {
          this.drawLV(page, block, `USt. ${invoice.taxRate}%:`, this.formatCurrency(invoice.totalTaxAmount ?? 0), pdfY, fontSize, color, font);
        }
        break;
      case 'total-gross':
        this.drawLV(page, block,
          invoice.kleinunternehmer ? 'Rechnungssumme:' : 'Bruttobetrag:',
          this.formatCurrency(invoice.totalGrossAmount ?? 0), pdfY, fontSize, color, font);
        break;
      case 'payment-means': {
        const meansLabel = PAYMENT_MEANS_CODES[invoice.paymentMeansCode] ?? invoice.paymentMeansCode;
        this.drawLV(page, block, 'Zahlungsart:', meansLabel, pdfY, fontSize, color, font);
        break;
      }
      case 'iban-bic': {
        const parts: [string, string][] = [];
        if (invoice.iban) parts.push(['IBAN:', formatIban(invoice.iban)]);
        if (invoice.bic) parts.push(['BIC:', invoice.bic]);
        const lineH = fontSize * 1.4;
        let y = pdfY;
        for (const [label, value] of parts) {
          if (block.textAlign !== 'left') {
            this.drawLabelValue(page, block, label, value, y, fontSize, color, font);
          } else {
            page.drawText(`${label} ${value}`, { x: block.x + (block.paddingLeft ?? 0), y, font, size: fontSize, color, maxWidth: block.width - (block.paddingLeft ?? 0) - (block.paddingRight ?? 0) });
          }
          y -= lineH;
        }
        break;
      }
      case 'payment-terms':
        if (invoice.paymentTerms) {
          this.drawLV(page, block, 'Zahlungsziel:', invoice.paymentTerms, pdfY, fontSize, color, font);
        }
        break;
      case 'kleinunternehmer-note':
        if (invoice.kleinunternehmer) {
          this.drawSimpleText(page, block, KLEINUNTERNEHMER_NOTE, pdfY, fontSize, color, font);
        }
        break;
    }
  }

  private drawSellerAddress(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    const s = invoice.seller;
    const lines = [s.name, s.street, `${s.postalCode} ${s.city}`];
    if (s.vatId) lines.push(`USt-IdNr.: ${s.vatId}`);
    if (s.taxNumber) lines.push(`Steuernr.: ${s.taxNumber}`);
    const lineH = fontSize * 1.4;
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    let y = pdfY;
    for (const line of lines) {
      const sepIdx = line.indexOf(': ');
      if (sepIdx !== -1 && block.textAlign !== 'left') {
        this.drawLabelValue(page, block, line.slice(0, sepIdx + 1), line.slice(sepIdx + 2), y, fontSize, color, font);
      } else {
        page.drawText(line, { x: block.x + padL, y, font, size: fontSize, color, maxWidth: block.width - padL - padR });
      }
      y -= lineH;
    }
  }

  private drawBuyerAddress(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    const b = invoice.buyer;
    const lines = [b.name, b.street, `${b.postalCode} ${b.city}`];
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    page.drawText(lines.join('\n'), {
      x: block.x + padL, y: pdfY, font, size: fontSize, color,
      maxWidth: block.width - padL - padR, lineHeight: fontSize * 1.4,
    });
  }

  private drawInvoiceHeader(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    const lineH = fontSize * 1.4;
    const rows: [string, string][] = [
      ['Nr.:', invoice.invoiceNumber],
      ['Datum:', this.formatDate(invoice.invoiceDate)],
    ];
    if (invoice.dueDate) rows.push(['Fällig:', this.formatDate(invoice.dueDate)]);
    if (invoice.buyerReference) rows.push(['Referenz:', invoice.buyerReference]);

    let y = pdfY;
    for (const [label, value] of rows) {
      this.drawLV(page, block, label, value, y, fontSize, color, font);
      y -= lineH;
    }
  }

  private drawLinesTable(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, pageHeight: number, fontSize: number, color: RGB,
    font: FontInput = 'Helvetica', boldFont: FontInput = 'Helvetica-Bold',
  ): void {
    const headerBgColor = block.tableHeaderBgColor ?? '#f0f0eb';
    const headerBg = this.parseColor(headerBgColor);
    const borderColor = rgb(0.82, 0.81, 0.78);
    const accentColor = this.parseColor('#a62f24');
    const rowHeight = fontSize * (block.lineHeight ?? 1.8);
    const headerHeight = rowHeight + 4;
    const showHeader = block.showHeader !== false;
    const tableStyle = block.tableStyle ?? 'minimal';
    // striped: distinct saturated alt bg
    const stripeBg = rgb(0.933, 0.925, 0.914); // #eeecea
    // striped: strong header bg
    const stripedHdrBg = rgb(0.847, 0.839, 0.816); // #d8d6d0

    // Column definitions — all possible columns
    const allColumns: { key: string; header: string; ratio: number }[] = [
      { key: 'pos', header: 'Pos', ratio: 0.06 },
      { key: 'name', header: 'Bezeichnung', ratio: 0.34 },
      { key: 'qty', header: 'Menge', ratio: 0.1 },
      { key: 'unit', header: 'Einheit', ratio: 0.1 },
      { key: 'price', header: 'Einzelpreis', ratio: 0.2 },
      { key: 'total', header: 'Netto', ratio: 0.2 },
    ];

    // Filter to visible columns
    const visibleCols = (block.columns && block.columns.length > 0)
      ? allColumns.filter(c => block.columns!.includes(c.key))
      : allColumns;

    // Recalculate widths proportionally
    const totalRatio = visibleCols.reduce((sum, c) => sum + c.ratio, 0);
    const colWidths = visibleCols.map(c => (c.ratio / totalRatio) * block.width);

    let currentY = pdfY;

    if (showHeader) {
      // Header background
      if (tableStyle === 'striped') {
        page.drawRectangle({ x: block.x, y: currentY - headerHeight, width: block.width, height: headerHeight, color: stripedHdrBg });
      } else if (tableStyle !== 'compact' && tableStyle !== 'elegant') {
        page.drawRectangle({ x: block.x, y: currentY - headerHeight, width: block.width, height: headerHeight, color: headerBg });
      }

      // Compute white text for modern when bg is dark
      let headerTextColor = color;
      if (tableStyle === 'modern') {
        const hdr = this.parseColor(headerBgColor);
        const luminance = 0.299 * hdr.red + 0.587 * hdr.green + 0.114 * hdr.blue;
        if (luminance < 0.5) headerTextColor = rgb(1, 1, 1);
      }

      // Header text
      // colX starts at block.x (not block.x+4). Each formula adds/subtracts 4pt symmetrically:
      //   left:   textX = colX + 4               → 4pt from column left edge
      //   right:  textX = colX + colW - 4 - w    → 4pt from column right edge
      //   center: textX = colX + (colW - w) / 2  → centered within column
      // This ensures the leftmost left-aligned text and rightmost right-aligned text
      // both have 4pt padding from the block edge.
      const headerRowBottom = currentY - headerHeight;
      const headerTextY = headerRowBottom + Math.round((headerHeight - (fontSize - 1)) / 2);
      let colX = block.x;
      for (let i = 0; i < visibleCols.length; i++) {
        const colKey = visibleCols[i].key as 'pos' | 'name' | 'qty' | 'unit' | 'price' | 'total';
        const align = block.columnAlignments?.[colKey] ?? 'left';
        let textX: number;
        const headerText = visibleCols[i].header;
        if (align === 'right') {
          textX = colX + colWidths[i] - 4 - this.measureWidth(headerText, fontSize - 1, boldFont);
        } else if (align === 'center') {
          textX = colX + (colWidths[i] - this.measureWidth(headerText, fontSize - 1, boldFont)) / 2;
        } else {
          textX = colX + 4;
        }
        page.drawText(headerText, {
          x: textX, y: headerTextY,
          font: boldFont, size: fontSize - 1, color: headerTextColor,
        });
        colX += colWidths[i];
      }

      // Header bottom line
      let headerLineThickness: number;
      let headerLineColor = borderColor;
      if (tableStyle === 'compact') {
        headerLineThickness = 1.5;
        headerLineColor = accentColor; // red
      } else if (tableStyle === 'elegant') {
        headerLineThickness = 1.0;
        headerLineColor = rgb(0.33, 0.33, 0.33); // dark neutral
      } else if (tableStyle === 'striped') {
        headerLineThickness = 1.0;
        headerLineColor = rgb(0.73, 0.725, 0.706);
      } else {
        headerLineThickness = 0.5;
      }
      if (block.tableHeaderLineColor) {
        headerLineColor = this.parseColor(block.tableHeaderLineColor);
      }
      page.drawLine({
        start: { x: block.x, y: currentY - headerHeight },
        end: { x: block.x + block.width, y: currentY - headerHeight },
        color: headerLineColor, thickness: headerLineThickness,
      });

      // Grid: vertical lines in header
      if (tableStyle === 'grid') {
        let vx = block.x;
        for (let i = 0; i < colWidths.length; i++) {
          vx += colWidths[i];
          if (i < colWidths.length - 1) {
            page.drawLine({
              start: { x: vx, y: currentY },
              end: { x: vx, y: currentY - headerHeight },
              color: borderColor, thickness: 0.5,
            });
          }
        }
      }

      currentY -= headerHeight;
    }

    // Compute modern tint color (20% opacity blend of headerBgColor with white)
    let modernTintBg: RGB | null = null;
    if (tableStyle === 'modern') {
      const hdr = this.parseColor(headerBgColor);
      modernTintBg = rgb(
        hdr.red * 0.2 + 0.8,
        hdr.green * 0.2 + 0.8,
        hdr.blue * 0.2 + 0.8,
      );
    }

    // Data rows
    for (let rowIdx = 0; rowIdx < invoice.lines.length; rowIdx++) {
      const line = invoice.lines[rowIdx];
      const rowY = currentY - rowHeight;

      // Row backgrounds
      if (tableStyle === 'striped' && rowIdx % 2 === 1) {
        page.drawRectangle({ x: block.x, y: rowY, width: block.width, height: rowHeight, color: stripeBg });
      } else if (tableStyle === 'modern' && rowIdx % 2 === 1 && modernTintBg) {
        page.drawRectangle({ x: block.x, y: rowY, width: block.width, height: rowHeight, color: modernTintBg });
      }
      // elegant: extra top spacing (6pt) is already handled by rowHeight being larger

      // Build cell values keyed by column key
      const cellMap: Record<string, string> = {
        pos: String(line.lineNumber),
        name: line.itemName,
        qty: this.formatNumber(line.quantity),
        unit: this.getUnitLabel(line.unitCode),
        price: this.formatCurrency(line.netPrice),
        total: this.formatCurrency(line.lineNetAmount),
      };

      const cellTextY = rowY + Math.round((rowHeight - (fontSize - 1)) / 2);
      let colX = block.x;
      for (let i = 0; i < visibleCols.length; i++) {
        const colKey = visibleCols[i].key as 'pos' | 'name' | 'qty' | 'unit' | 'price' | 'total';
        const align = block.columnAlignments?.[colKey] ?? 'left';
        const cellText = cellMap[colKey];
        let textX: number;
        if (align === 'right') {
          textX = colX + colWidths[i] - 4 - this.measureWidth(cellText, fontSize - 1, font);
        } else if (align === 'center') {
          textX = colX + (colWidths[i] - this.measureWidth(cellText, fontSize - 1, font)) / 2;
        } else {
          textX = colX + 4;
        }
        if (align === 'left') {
          page.drawText(cellText, { x: textX, y: cellTextY, font, size: fontSize - 1, color, maxWidth: colWidths[i] - 8 });
        } else {
          this.drawTextSafe(page, cellText, textX, cellTextY, fontSize - 1, color, font);
        }
        colX += colWidths[i];
      }

      // Row separators based on style
      if (tableStyle === 'minimal') {
        page.drawLine({
          start: { x: block.x, y: rowY },
          end: { x: block.x + block.width, y: rowY },
          color: rgb(0.91, 0.9, 0.88), thickness: 0.3,
        });
      } else if (tableStyle === 'grid') {
        page.drawLine({
          start: { x: block.x, y: rowY },
          end: { x: block.x + block.width, y: rowY },
          color: borderColor, thickness: 0.5,
        });
        let vx = block.x;
        for (let i = 0; i < colWidths.length; i++) {
          vx += colWidths[i];
          if (i < colWidths.length - 1) {
            page.drawLine({
              start: { x: vx, y: currentY },
              end: { x: vx, y: rowY },
              color: borderColor, thickness: 0.5,
            });
          }
        }
      } else if (tableStyle === 'compact') {
        page.drawLine({
          start: { x: block.x, y: rowY },
          end: { x: block.x + block.width, y: rowY },
          color: rgb(0.88, 0.87, 0.85), thickness: 0.3,
        });
      } else if (tableStyle === 'modern') {
        // accent-colored bottom lines
        page.drawLine({
          start: { x: block.x, y: rowY },
          end: { x: block.x + block.width, y: rowY },
          color: accentColor, thickness: 0.3,
        });
      }
      // elegant: no row separators at all
      // striped: no row separator lines

      currentY -= rowHeight;
    }

    // Grid: outer border
    if (tableStyle === 'grid') {
      const tableTop = pdfY;
      const tableBottom = currentY;
      page.drawRectangle({
        x: block.x, y: tableBottom,
        width: block.width, height: tableTop - tableBottom,
        borderColor, borderWidth: 0.5,
      });
    }
  }

  private drawTotals(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput, boldFont: FontInput,
  ): void {
    const lineH = fontSize * 1.6;
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    const labelX = block.x + padL;

    const rows: [string, string][] = invoice.kleinunternehmer
      ? [['Rechnungssumme:', this.formatCurrency(invoice.totalGrossAmount ?? 0)]]
      : [
          ['Nettobetrag:', this.formatCurrency(invoice.totalNetAmount ?? 0)],
          [`USt. ${invoice.taxRate}%:`, this.formatCurrency(invoice.totalTaxAmount ?? 0)],
          ['Bruttobetrag:', this.formatCurrency(invoice.totalGrossAmount ?? 0)],
        ];

    let y = pdfY - fontSize;
    for (let i = 0; i < rows.length; i++) {
      const isLast = i === rows.length - 1;
      // Separator line before the last (bold) row
      if (isLast) {
        page.drawLine({
          start: { x: block.x, y: y + fontSize + 2 },
          end: { x: block.x + block.width, y: y + fontSize + 2 },
          color: rgb(0.82, 0.81, 0.78), thickness: 0.5,
        });
      }
      const f: FontInput = isLast ? boldFont : font;
      const s = isLast ? fontSize + 1 : fontSize;
      if (block.textAlign === 'left') {
        page.drawText(`${rows[i][0]} ${rows[i][1]}`, { x: labelX, y, font: f, size: s, color, maxWidth: block.width - padL - padR });
      } else {
        const valueX = block.x + block.width - padR - this.measureWidth(rows[i][1], s, f);
        this.drawTextSafe(page, rows[i][0], labelX, y, s, color, f);
        this.drawTextSafe(page, rows[i][1], valueX, y, s, color, f);
      }
      y -= lineH;
    }
  }

  private drawPaymentInfo(
    page: PDFPage, block: PdfBlockDto, invoice: InvoiceDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    const lines: string[] = [];
    const meansLabel = PAYMENT_MEANS_CODES[invoice.paymentMeansCode] ?? invoice.paymentMeansCode;
    lines.push(`Zahlungsart: ${meansLabel}`);
    if (invoice.iban) lines.push(`IBAN: ${formatIban(invoice.iban)}`);
    if (invoice.bic) lines.push(`BIC: ${invoice.bic}`);
    if (invoice.paymentTerms) lines.push(`Zahlungsziel: ${invoice.paymentTerms}`);

    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    page.drawText(lines.join('\n'), {
      x: block.x + padL, y: pdfY, font, size: fontSize, color,
      maxWidth: block.width - padL - padR, lineHeight: fontSize * 1.4,
    });
  }

  private drawFreeText(
    page: PDFPage, block: PdfBlockDto,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    if (!block.content) return;
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    const maxW = block.width - padL - padR;
    // Map textAlign to LibPDF alignment values
    const alignMap: Record<string, string> = {
      center: 'center', right: 'right', block: 'justify', left: 'left',
    };
    const alignment = alignMap[block.textAlign ?? 'left'] ?? 'left';
    page.drawText(block.content, {
      x: block.x + padL, y: pdfY, font, size: fontSize, color,
      maxWidth: maxW, lineHeight: fontSize * 1.4,
      alignment: alignment as any,
    });
  }

  private drawImage(
    pdf: PDF,
    page: PDFPage,
    block: PdfBlockDto,
    template: PdfTemplateDto,
    pdfY: number,
  ): void {
    if (!template.logoData) return;
    try {
      const rawBytes = Buffer.from(template.logoData, 'base64');
      if (template.logoMimeType === 'image/svg+xml') {
        // For SVGs: attempt vector rendering; falls back to resvg rasterization internally
        // pdfY for image = pageHeight - block.y - block.height (block bottom in PDF space)
        SvgToPdfRenderer.render(pdf, page, block, rawBytes, pdfY);
        return;
      }
      const image = pdf.embedImage(new Uint8Array(rawBytes));
      const locked = block.lockAspectRatio !== false; // default: locked
      let drawWidth = block.width;
      let drawHeight: number;
      let imgY: number;
      if (locked) {
        // Maintain aspect ratio: fill width, proportional height, top-aligned
        const aspectRatio = image.height / image.width;
        drawHeight = drawWidth * aspectRatio;
        imgY = pdfY + block.height - drawHeight; // pdfY = block bottom
      } else {
        // Stretch to fill the full block dimensions
        drawHeight = block.height;
        imgY = pdfY; // pdfY = block bottom, height = block.height → fills exactly
      }
      page.drawImage(image, { x: block.x, y: imgY, width: drawWidth, height: drawHeight });
    } catch (err) {
      console.error('Logo embedding failed:', err);
    }
  }

  private drawLineElement(page: PDFPage, block: PdfBlockDto, pdfY: number): void {
    const thickness = block.lineThickness ?? 1;
    const color = this.parseColor(block.lineColor ?? '#1c1b18');
    const direction = block.lineDirection ?? 'horizontal';

    if (direction === 'horizontal') {
      const centerY = pdfY + block.height / 2;
      page.drawLine({
        start: { x: block.x, y: centerY },
        end: { x: block.x + block.width, y: centerY },
        color, thickness,
      });
    } else {
      const centerX = block.x + block.width / 2;
      page.drawLine({
        start: { x: centerX, y: pdfY + block.height },
        end: { x: centerX, y: pdfY },
        color, thickness,
      });
    }
  }

  /** Draws a label:value pair respecting block.textAlign.
   *  'block' (default): label left, value right-aligned.
   *  'left': concatenated "label value" drawn left-aligned. */
  private drawLV(
    page: PDFPage, block: PdfBlockDto, label: string, value: string,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    if (block.textAlign === 'left') {
      const padL = block.paddingLeft ?? 0;
      const padR = block.paddingRight ?? 0;
      page.drawText(`${label} ${value}`, {
        x: block.x + padL, y: pdfY, font, size: fontSize, color,
        maxWidth: block.width - padL - padR, lineHeight: fontSize * 1.4,
      });
    } else {
      this.drawLabelValue(page, block, label, value, pdfY, fontSize, color, font);
    }
  }

  private drawSimpleText(
    page: PDFPage, block: PdfBlockDto, text: string,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    if (!text) return;
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    page.drawText(text, {
      x: block.x + padL, y: pdfY, font, size: fontSize, color,
      maxWidth: block.width - padL - padR, lineHeight: fontSize * 1.4,
    });
  }

  private drawLabelValue(
    page: PDFPage, block: PdfBlockDto, label: string, value: string,
    pdfY: number, fontSize: number, color: RGB, font: FontInput,
  ): void {
    const padL = block.paddingLeft ?? 0;
    const padR = block.paddingRight ?? 0;
    const textX  = block.x + padL;
    const innerW = block.width - padL - padR;
    this.drawTextSafe(page, label, textX, pdfY, fontSize, color, font);
    const labelEnd = textX + this.measureWidth(label, fontSize, font) + 4;
    const valueX = Math.max(labelEnd, textX + innerW - this.measureWidth(value, fontSize, font));
    this.drawTextSafe(page, value, valueX, pdfY, fontSize, color, font);
  }

  /**
   * Splits text into consecutive runs of characters that either CAN or CANNOT
   * be encoded by the embedded font. Non-encodable chars fall back to Helvetica.
   */
  private getTextRuns(text: string, font: EmbeddedFont): Array<{ text: string; embedded: boolean }> {
    const runs: Array<{ text: string; embedded: boolean }> = [];
    let runText = '';
    let runEmbedded: boolean | null = null;
    for (const char of text) {
      const embedded = font.canEncode(char);
      if (embedded !== runEmbedded) {
        if (runText) runs.push({ text: runText, embedded: runEmbedded! });
        runText = char;
        runEmbedded = embedded;
      } else {
        runText += char;
      }
    }
    if (runText) runs.push({ text: runText, embedded: runEmbedded! });
    return runs;
  }

  /**
   * Draws single-line text with per-character Helvetica fallback for characters
   * the embedded font cannot encode (e.g. € in fonts with incomplete Unicode cmaps).
   * Browsers do the same thing silently. Does NOT support maxWidth/lineHeight.
   */
  private drawTextSafe(
    page: PDFPage, text: string, x: number, y: number,
    size: number, color: RGB, font: FontInput,
  ): void {
    if (typeof font === 'string' || font.canEncode(text)) {
      page.drawText(text, { x, y, size, color, font });
      return;
    }
    let currentX = x;
    for (const run of this.getTextRuns(text, font)) {
      if (run.embedded) {
        page.drawText(run.text, { x: currentX, y, size, color, font });
        currentX += measureText(run.text, font, size);
      } else {
        page.drawText(run.text, { x: currentX, y, size, color, font: 'Helvetica' as Standard14FontName });
        currentX += measureHelveticaWidth(run.text, size, 'Helvetica');
      }
    }
  }

  /** Measure text width in PDF points. Works for Standard14 and custom EmbeddedFont.
   *  Accounts for per-character Helvetica fallback for unencodable characters. */
  private measureWidth(text: string, fontSize: number, font: FontInput): number {
    if (typeof font === 'string') return measureHelveticaWidth(text, fontSize, font);
    if (font.canEncode(text)) return measureText(text, font, fontSize);
    // Some characters are not encodable — measure each run separately
    let total = 0;
    for (const run of this.getTextRuns(text, font)) {
      total += run.embedded
        ? measureText(run.text, font, fontSize)
        : measureHelveticaWidth(run.text, fontSize, 'Helvetica');
    }
    return total;
  }


  private parseColor(hex: string): RGB {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
  }

  private formatDate(dateStr: string): string {
    const settings = this.settingsService.get();
    return fmtDate(dateStr, settings.dateFormat);
  }

  private formatCurrency(amount: number): string {
    const settings = this.settingsService.get();
    return amount.toLocaleString(settings.numberFormat, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  private formatNumber(n: number): string {
    const settings = this.settingsService.get();
    return n % 1 === 0 ? String(n) : n.toLocaleString(settings.numberFormat, { maximumFractionDigits: 3 });
  }

  private getUnitLabel(code: string): string {
    return UNIT_CODES[code] ?? code;
  }

}
