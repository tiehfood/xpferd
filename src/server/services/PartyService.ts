import type { PartyDto } from '../../shared/types';
import { PartyModel } from '../models/Party.js';
import { InvoiceModel } from '../models/Invoice.js';
import { Database } from '../database/Database.js';

export class PartyService {
  private get model(): PartyModel {
    return new PartyModel(Database.getInstance().getDb());
  }

  private get invoiceModel(): InvoiceModel {
    return new InvoiceModel(Database.getInstance().getDb());
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
    // Capture old party data before updating so we can match invoices
    const oldParty = this.model.findById(id);
    if (!oldParty) return null;

    const updated = this.model.update(id, dto);
    if (!updated) return null;

    // Propagate changes to all invoices that still reference the old party data
    if (dto.type === 'seller') {
      this.invoiceModel.updateSellerByMatch(oldParty.name, oldParty.city, {
        name: dto.name,
        street: dto.street,
        city: dto.city,
        postalCode: dto.postalCode,
        countryCode: dto.countryCode,
        vatId: dto.vatId,
        taxNumber: dto.taxNumber,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
      });
    } else {
      this.invoiceModel.updateBuyerByMatch(oldParty.name, oldParty.city, {
        name: dto.name,
        street: dto.street,
        city: dto.city,
        postalCode: dto.postalCode,
        countryCode: dto.countryCode,
        vatId: dto.vatId,
        email: dto.email,
      });
    }

    return updated;
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }
}
