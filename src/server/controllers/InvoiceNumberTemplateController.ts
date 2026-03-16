import type { Request, Response } from 'express';
import type { InvoiceNumberTemplateDto } from '../../shared/types';
import { InvoiceNumberTemplateService } from '../services/InvoiceNumberTemplateService.js';
import { invoiceNumberTemplateSchema } from '../validators/templateValidators.js';
import { ZodError } from 'zod';

export class InvoiceNumberTemplateController {
  private service = new InvoiceNumberTemplateService();

  listAll = (_req: Request, res: Response): void => {
    res.json(this.service.listAll());
  };

  getById = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const item = this.service.getById(id);
    if (!item) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(item);
  };

  create = (req: Request, res: Response): void => {
    try {
      const data = invoiceNumberTemplateSchema.parse(req.body);
      res.status(201).json(this.service.create(data as InvoiceNumberTemplateDto));
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
      const data = invoiceNumberTemplateSchema.parse(req.body);
      const item = this.service.update(id, data as InvoiceNumberTemplateDto);
      if (!item) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      res.json(item);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      throw err;
    }
  };

  previewNext = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const result = this.service.previewNext(id);
    if (!result) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(result);
  };

  generateNext = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const result = this.service.generateNext(id);
    if (!result) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(result);
  };

  delete = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    if (!this.service.delete(id)) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(204).send();
  };
}
