import type { PartyDto } from '../../shared/types';
import { PartyModel } from '../models/Party.js';
import { Database } from '../database/Database.js';

export class PartyService {
  private get model(): PartyModel {
    return new PartyModel(Database.getInstance().getDb());
  }

  listAll(type?: 'seller' | 'buyer'): PartyDto[] {
    return this.model.findAll(type);
  }

  getById(id: number): PartyDto | null {
    return this.model.findById(id);
  }

  create(dto: PartyDto): PartyDto {
    return this.model.create(dto);
  }

  update(id: number, dto: PartyDto): PartyDto | null {
    return this.model.update(id, dto);
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
