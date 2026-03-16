import type { Request, Response } from 'express';
import type { LineItemTemplateDto } from '../../shared/types';
import { LineItemTemplateService } from '../services/LineItemTemplateService.js';
import { lineItemTemplateSchema } from '../validators/templateValidators.js';
import { ZodError } from 'zod';

export class LineItemTemplateController {
  private service = new LineItemTemplateService();

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
      const data = lineItemTemplateSchema.parse(req.body);
      res.status(201).json(this.service.create(data as LineItemTemplateDto));
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
      const data = lineItemTemplateSchema.parse(req.body);
      const item = this.service.update(id, data as LineItemTemplateDto);
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

  delete = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    if (!this.service.delete(id)) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(204).send();
  };
}
