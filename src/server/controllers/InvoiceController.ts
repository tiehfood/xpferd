import type { Request, Response } from 'express';
import type { InvoiceDto } from '../../shared/types';
import { InvoiceService } from '../services/InvoiceService.js';
import { invoiceSchema } from '../validators/invoiceValidator.js';
import { ZodError } from 'zod';

export class InvoiceController {
  private service = new InvoiceService();

  listAll = (_req: Request, res: Response): void => {
    const invoices = this.service.listAll();
    res.json(invoices);
  };

  getById = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const invoice = this.service.getById(id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.json(invoice);
  };

  create = (req: Request, res: Response): void => {
    try {
      const data = invoiceSchema.parse(req.body);
      const invoice = this.service.create(data as InvoiceDto);
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      throw err;
    }
  };

  update = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    try {
      const data = invoiceSchema.parse(req.body);
      const invoice = this.service.update(id, data as InvoiceDto);
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      res.json(invoice);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      throw err;
    }
  };

  delete = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const deleted = this.service.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.status(204).send();
  };

  duplicate = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const invoice = this.service.duplicate(id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.status(201).json(invoice);
  };
}
