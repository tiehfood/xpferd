import type { InvoiceDto, InvoiceSummaryDto } from '../../shared/types';
import { InvoiceModel } from '../models/Invoice.js';
import { Database } from '../database/Database.js';

export class InvoiceService {
  private get model(): InvoiceModel {
    return new InvoiceModel(Database.getInstance().getDb());
  }

  listAll(): InvoiceSummaryDto[] {
    return this.model.findAll();
  }

  getById(id: number): InvoiceDto | null {
    return this.model.findById(id);
  }

  create(dto: InvoiceDto): InvoiceDto {
    this.calculateTotals(dto);
    return this.model.create(dto);
  }

  update(id: number, dto: InvoiceDto): InvoiceDto | null {
    this.calculateTotals(dto);
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }

  duplicate(id: number): InvoiceDto | null {
    const original = this.model.findById(id);
    if (!original) return null;

    const copy: InvoiceDto = {
      ...original,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      invoiceNumber: `${original.invoiceNumber}-COPY`,
      lines: original.lines.map(l => ({ ...l, id: undefined, invoiceId: undefined })),
    };

    return this.model.create(copy);
  }

  private calculateTotals(dto: InvoiceDto): void {
    // Kleinunternehmerregelung: force VAT exemption
    if (dto.kleinunternehmer) {
      dto.taxCategoryCode = 'E';
      dto.taxRate = 0;
      for (const line of dto.lines) {
        line.vatCategoryCode = 'E';
        line.vatRate = 0;
      }
    }

    for (const line of dto.lines) {
      line.lineNetAmount = this.round2(line.quantity * line.netPrice);
    }

    dto.totalNetAmount = this.round2(
      dto.lines.reduce((sum, l) => sum + l.lineNetAmount, 0)
    );
    dto.totalTaxAmount = dto.kleinunternehmer
      ? 0
      : this.round2(dto.totalNetAmount * dto.taxRate / 100);
    dto.totalGrossAmount = this.round2(dto.totalNetAmount + dto.totalTaxAmount);
    dto.amountDue = dto.totalGrossAmount;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
