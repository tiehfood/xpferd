import type { InvoiceTemplateDto } from '../../shared/types';
import { InvoiceTemplateModel } from '../models/InvoiceTemplate.js';
import { Database } from '../database/Database.js';

export class InvoiceTemplateService {
  private get model(): InvoiceTemplateModel {
    return new InvoiceTemplateModel(Database.getInstance().getDb());
  }

  listAll(): InvoiceTemplateDto[] {
    return this.model.findAll();
  }

  getById(id: number): InvoiceTemplateDto | null {
    return this.model.findById(id);
  }

  create(dto: InvoiceTemplateDto): InvoiceTemplateDto {
    return this.model.create(dto);
  }

  update(id: number, dto: InvoiceTemplateDto): InvoiceTemplateDto | null {
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
