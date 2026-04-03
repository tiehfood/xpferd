import type { Request, Response, NextFunction } from 'express';
import type { EmailSettingsDto, EmailTemplateDto, SendEmailRequest } from '../../shared/types/index.js';
import { EmailService } from '../services/EmailService.js';
import {
  emailSettingsSchema,
  emailTemplateSchema,
  sendEmailSchema,
} from '../validators/emailValidator.js';
import { ZodError } from 'zod';

export class EmailController {
  private service = new EmailService();

  // ─── Settings ─────────────────────────────────────────────────────────────

  getSettings = (_req: Request, res: Response): void => {
    const settings = this.service.getSettings();
    // Never send the decrypted password to the client — mask it
    res.json({ ...settings, smtpPass: settings.smtpPass ? '••••••••' : '' });
  };

  updateSettings = (req: Request, res: Response): void => {
    try {
      const data = emailSettingsSchema.parse(req.body);
      // If client sends the masked password, load and keep existing
      let smtpPass = data.smtpPass;
      if (smtpPass === '••••••••') {
        const existing = this.service.getSettings();
        smtpPass = existing.smtpPass;
      }
      const updated = this.service.updateSettings({ ...data, smtpPass } as EmailSettingsDto);
      res.json({ ...updated, smtpPass: updated.smtpPass ? '••••••••' : '' });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validierung fehlgeschlagen', details: err.issues });
        return;
      }
      throw err;
    }
  };

  testConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.testConnection();
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  // ─── Templates ────────────────────────────────────────────────────────────

  listTemplates = (_req: Request, res: Response): void => {
    const templates = this.service.listTemplates();
    res.json(templates);
  };

  getTemplate = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const template = this.service.getTemplate(id);
    if (!template) {
      res.status(404).json({ error: 'E-Mail-Vorlage nicht gefunden' });
      return;
    }
    res.json(template);
  };

  createTemplate = (req: Request, res: Response): void => {
    try {
      const data = emailTemplateSchema.parse(req.body);
      const created = this.service.createTemplate(data as EmailTemplateDto);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validierung fehlgeschlagen', details: err.issues });
        return;
      }
      throw err;
    }
  };

  updateTemplate = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    try {
      const data = emailTemplateSchema.parse(req.body);
      const updated = this.service.updateTemplate(id, data as EmailTemplateDto);
      if (!updated) {
        res.status(404).json({ error: 'E-Mail-Vorlage nicht gefunden' });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validierung fehlgeschlagen', details: err.issues });
        return;
      }
      throw err;
    }
  };

  deleteTemplate = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const deleted = this.service.deleteTemplate(id);
    if (!deleted) {
      res.status(404).json({ error: 'E-Mail-Vorlage nicht gefunden' });
      return;
    }
    res.status(204).send();
  };

  // ─── Send ─────────────────────────────────────────────────────────────────

  sendEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const invoiceId = Number(req.params.id);
    try {
      const data = sendEmailSchema.parse(req.body);
      const log = await this.service.sendInvoiceEmail(invoiceId, data as SendEmailRequest);
      res.status(200).json(log);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validierung fehlgeschlagen', details: err.issues });
        return;
      }
      next(err);
    }
  };

  // ─── Log ──────────────────────────────────────────────────────────────────

  getLog = (req: Request, res: Response): void => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const logs = this.service.getLog(limit);
    res.json(logs);
  };

  getLogForInvoice = (req: Request, res: Response): void => {
    const invoiceId = Number(req.params.id);
    const logs = this.service.getLogForInvoice(invoiceId);
    res.json(logs);
  };
}
