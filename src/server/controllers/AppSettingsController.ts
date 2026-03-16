import type { Request, Response } from 'express';
import type { AppSettingsDto } from '../../shared/types';
import { AppSettingsService } from '../services/AppSettingsService.js';
import { appSettingsSchema } from '../validators/appSettingsValidator.js';
import { ZodError } from 'zod';

export class AppSettingsController {
  private service = new AppSettingsService();

  get = (_req: Request, res: Response): void => {
    const settings = this.service.get();
    res.json(settings);
  };

  update = (req: Request, res: Response): void => {
    try {
      const data = appSettingsSchema.parse(req.body);
      const settings = this.service.update(data as AppSettingsDto);
      res.json(settings);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      throw err;
    }
  };
}
