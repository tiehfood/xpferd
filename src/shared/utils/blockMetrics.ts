import type { PdfBlockDto, InvoiceDto } from '../types';

/**
 * Computes the vertical space (in pts / CSS px) a block's content will occupy
 * when rendered by LibPDF. Mirrors PdfRenderService drawing logic exactly so
 * the canvas preview and PDF output stay in sync.
 */
export function computeBlockContentHeight(block: PdfBlockDto, invoice: InvoiceDto): number {
  const fs = block.fontSize ?? 10;
  const lineH = fs * 1.4;

  // Content override: count newlines
  if (block.content && !['image', 'line', 'lines-table', 'free-text'].includes(block.type)) {
    return block.content.split('\n').length * lineH;
  }

  switch (block.type) {
    case 'seller-address': {
      const s = invoice.seller;
      let n = 3; // name, street, postal+city
      if (s.vatId) n++;
      if (s.taxNumber) n++;
      return n * lineH;
    }
    case 'buyer-address':
      return 3 * lineH;
    case 'invoice-title':
      return Math.ceil((fs + 4) * 1.4);
    case 'invoice-number':
    case 'invoice-date':
    case 'total-net':
    case 'total-gross':
    case 'payment-means':
      return Math.ceil(fs * 1.4);
    case 'due-date':
      return invoice.dueDate ? Math.ceil(fs * 1.4) : 0;
    case 'buyer-reference':
      return invoice.buyerReference ? Math.ceil(fs * 1.4) : 0;
    case 'total-tax':
      return !invoice.kleinunternehmer ? Math.ceil(fs * 1.4) : 0;
    case 'kleinunternehmer-note':
      return invoice.kleinunternehmer ? Math.ceil(fs * 1.4) : 0;
    case 'payment-terms':
      return invoice.paymentTerms ? Math.ceil(fs * 1.4) : 0;
    case 'invoice-header': {
      let rows = 2;
      if (invoice.dueDate) rows++;
      if (invoice.buyerReference) rows++;
      return rows * lineH;
    }
    case 'totals': {
      let rows = 2;
      if (!invoice.kleinunternehmer) rows++;
      return fs + rows * (fs * 1.6);
    }
    case 'iban-bic': {
      let n = 0;
      if (invoice.iban) n++;
      if (invoice.bic) n++;
      return n * lineH;
    }
    case 'payment-info': {
      let n = 1;
      if (invoice.iban) n++;
      if (invoice.bic) n++;
      if (invoice.paymentTerms) n++;
      return n * lineH;
    }
    case 'lines-table': {
      const rowH = fs * (block.lineHeight ?? 1.8);
      const headerH = block.showHeader !== false ? rowH + 4 : 0;
      return headerH + invoice.lines.length * rowH;
    }
    case 'line':
      return block.lineThickness ?? 1;
    case 'image':
      return block.height;
    case 'free-text':
      if (!block.content) return 0;
      return block.content.split('\n').length * lineH;
    default:
      return fs;
  }
}
