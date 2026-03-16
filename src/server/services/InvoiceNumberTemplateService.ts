import type { InvoiceNumberTemplateDto } from '../../shared/types';
import { InvoiceNumberTemplateModel } from '../models/InvoiceNumberTemplate.js';
import { Database } from '../database/Database.js';

export class InvoiceNumberTemplateService {
  private get model(): InvoiceNumberTemplateModel {
    return new InvoiceNumberTemplateModel(Database.getInstance().getDb());
  }

  listAll(): InvoiceNumberTemplateDto[] {
    return this.model.findAll();
  }

  getById(id: number): InvoiceNumberTemplateDto | null {
    return this.model.findById(id);
  }

  create(dto: InvoiceNumberTemplateDto): InvoiceNumberTemplateDto {
    return this.model.create(dto);
  }

  update(id: number, dto: InvoiceNumberTemplateDto): InvoiceNumberTemplateDto | null {
    return this.model.update(id, dto);
  }

  previewNext(id: number): { invoiceNumber: string } | null {
    return this.model.previewNext(id);
  }

  generateNext(id: number): { invoiceNumber: string } | null {
    return this.model.generateNext(id);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
