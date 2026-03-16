import type { Request, Response } from 'express';
import type { PartyDto } from '../../shared/types';
import { PartyService } from '../services/PartyService.js';
import { partySchema } from '../validators/partyValidator.js';
import { ZodError } from 'zod';

export class PartyController {
  private service = new PartyService();

  listAll = (req: Request, res: Response): void => {
    const type = req.query.type as 'seller' | 'buyer' | undefined;
    const parties = this.service.listAll(type);
    res.json(parties);
  };

  getById = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const party = this.service.getById(id);
    if (!party) {
      res.status(404).json({ error: 'Party not found' });
      return;
    }
    res.json(party);
  };

  create = (req: Request, res: Response): void => {
    try {
      const data = partySchema.parse(req.body);
      const party = this.service.create(data as PartyDto);
      res.status(201).json(party);
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
      const data = partySchema.parse(req.body);
      const party = this.service.update(id, data as PartyDto);
      if (!party) {
        res.status(404).json({ error: 'Party not found' });
        return;
      }
      res.json(party);
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
      res.status(404).json({ error: 'Party not found' });
      return;
    }
    res.status(204).send();
  };
}
