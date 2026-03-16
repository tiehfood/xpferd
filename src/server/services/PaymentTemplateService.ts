import type { PaymentTemplateDto } from '../../shared/types';
import { PaymentTemplateModel } from '../models/PaymentTemplate.js';
import { Database } from '../database/Database.js';

export class PaymentTemplateService {
  private get model(): PaymentTemplateModel {
    return new PaymentTemplateModel(Database.getInstance().getDb());
  }

  listAll(): PaymentTemplateDto[] {
    return this.model.findAll();
  }

  getById(id: number): PaymentTemplateDto | null {
    return this.model.findById(id);
  }

  create(dto: PaymentTemplateDto): PaymentTemplateDto {
    return this.model.create(dto);
  }

  update(id: number, dto: PaymentTemplateDto): PaymentTemplateDto | null {
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
