import type { PdfTemplateDto } from '../../shared/types';
import { PdfTemplateModel } from '../models/PdfTemplate.js';
import { Database } from '../database/Database.js';

export class PdfTemplateService {
  private get model(): PdfTemplateModel {
    return new PdfTemplateModel(Database.getInstance().getDb());
  }

  listAll(): PdfTemplateDto[] {
    return this.model.findAll();
  }

  getById(id: number): PdfTemplateDto | null {
    return this.model.findById(id);
  }

  create(dto: PdfTemplateDto): PdfTemplateDto {
    return this.model.create(dto);
  }

  update(id: number, dto: PdfTemplateDto): PdfTemplateDto | null {
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
