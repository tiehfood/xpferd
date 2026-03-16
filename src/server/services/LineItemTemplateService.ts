import type { LineItemTemplateDto } from '../../shared/types';
import { LineItemTemplateModel } from '../models/LineItemTemplate.js';
import { Database } from '../database/Database.js';

export class LineItemTemplateService {
  private get model(): LineItemTemplateModel {
    return new LineItemTemplateModel(Database.getInstance().getDb());
  }

  listAll(): LineItemTemplateDto[] {
    return this.model.findAll();
  }

  getById(id: number): LineItemTemplateDto | null {
    return this.model.findById(id);
  }

  create(dto: LineItemTemplateDto): LineItemTemplateDto {
    return this.model.create(dto);
  }

  update(id: number, dto: LineItemTemplateDto): LineItemTemplateDto | null {
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
