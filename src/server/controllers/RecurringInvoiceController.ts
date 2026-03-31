import type { Request, Response } from 'express';
import type { RecurringInvoiceDto } from '../../shared/types/index.js';
import { RecurringInvoiceService } from '../services/RecurringInvoiceService.js';
import { recurringInvoiceSchema } from '../validators/recurringInvoiceValidator.js';
import { ZodError } from 'zod';

export class RecurringInvoiceController {
  private service = new RecurringInvoiceService();

  list = (_req: Request, res: Response): void => {
    const items = this.service.listAll();
    res.json(items);
  };

  getById = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const item = this.service.getById(id);
    if (!item) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    res.json(item);
  };

  create = (req: Request, res: Response): void => {
    try {
      const data = recurringInvoiceSchema.parse(req.body);
      const created = this.service.create(data as RecurringInvoiceDto);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      throw err;
    }
  };

  update = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    try {
      const data = recurringInvoiceSchema.parse(req.body);
      const updated = this.service.update(id, data as RecurringInvoiceDto);
      if (!updated) {
        res.status(404).json({ error: 'Recurring invoice not found' });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      throw err;
    }
  };

  delete = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const deleted = this.service.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    res.status(204).send();
  };

  toggleActive = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const result = this.service.toggleActive(id);
    if (!result) {
      res.status(404).json({ error: 'Recurring invoice not found' });
      return;
    }
    res.json(result);
  };

  generate = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const result = this.service.generateInvoice(id);
    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  };

  generateAll = (_req: Request, res: Response): void => {
    const result = this.service.generateDueInvoices();
    res.json(result);
  };

  previewOccurrences = (req: Request, res: Response): void => {
    const { months = 3, ...ruleFields } = req.body as { months?: number } & Partial<RecurringInvoiceDto>;
    const dates = this.service.previewOccurrences(ruleFields, months);
    res.json({ dates });
  };

  getLogs = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const logs = this.service.getLogs(id, limit);
    res.json(logs);
  };

  getAllLogs = (req: Request, res: Response): void => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const logs = this.service.getAllLogs(limit);
    res.json(logs);
  };
}
