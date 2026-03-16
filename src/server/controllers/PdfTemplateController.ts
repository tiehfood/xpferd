import type { Request, Response } from 'express';
import type { PdfTemplateDto } from '../../shared/types';
import { PdfTemplateService } from '../services/PdfTemplateService.js';
import { InvoiceService } from '../services/InvoiceService.js';
import { PdfRenderService } from '../services/PdfRenderService.js';
import { ZUGFeRDService } from '../services/ZUGFeRDService.js';
import { XRechnungXmlService } from '../services/XRechnungXmlService.js';
import { pdfTemplateSchema, previewDraftSchema } from '../validators/pdfTemplateValidator.js';
import { ZodError } from 'zod';

export class PdfTemplateController {
  private service = new PdfTemplateService();
  private invoiceService = new InvoiceService();
  private renderService = new PdfRenderService();
  private zugferdService = new ZUGFeRDService();
  private xmlService = new XRechnungXmlService();

  listAll = (_req: Request, res: Response): void => {
    res.json(this.service.listAll());
  };

  getById = (req: Request, res: Response): void => {
    const id = Number(req.params.id);
    const item = this.service.getById(id);
    if (!item) { res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' }); return; }
    res.json(item);
  };

  create = (req: Request, res: Response): void => {
    try {
      const data = pdfTemplateSchema.parse(req.body);
      res.status(201).json(this.service.create(data as PdfTemplateDto));
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
      const data = pdfTemplateSchema.parse(req.body);
      const item = this.service.update(id, data as PdfTemplateDto);
      if (!item) { res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' }); return; }
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
      res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' });
      return;
    }
    res.status(204).send();
  };

  previewDraft = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = previewDraftSchema.parse(req.body);
      const invoice = this.invoiceService.getById(data.invoiceId);
      if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden' }); return; }
      const pdfBytes = await this.renderService.render(data.template as PdfTemplateDto, invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('PDF draft preview error:', err);
      res.status(500).json({ error: 'PDF-Generierung fehlgeschlagen' });
    }
  };

  preview = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const invoiceId = Number(req.query.invoiceId);

    const template = this.service.getById(id);
    if (!template) { res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' }); return; }

    const invoice = this.invoiceService.getById(invoiceId);
    if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden' }); return; }

    try {
      const pdfBytes = await this.renderService.render(template, invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error('PDF render error:', err);
      res.status(500).json({ error: 'PDF-Generierung fehlgeschlagen' });
    }
  };

  exportPdf = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const invoiceId = Number(req.query.invoiceId);

    const template = this.service.getById(id);
    if (!template) { res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' }); return; }

    const invoice = this.invoiceService.getById(invoiceId);
    if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden' }); return; }

    try {
      const pdfBytes = await this.renderService.render(template, invoice);
      const filename = `${invoice.invoiceNumber}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error('PDF export error:', err);
      res.status(500).json({ error: 'PDF-Export fehlgeschlagen' });
    }
  };

  exportZugferd = async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const invoiceId = Number(req.query.invoiceId);

    const template = this.service.getById(id);
    if (!template) { res.status(404).json({ error: 'PDF-Vorlage nicht gefunden' }); return; }

    const invoice = this.invoiceService.getById(invoiceId);
    if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden' }); return; }

    try {
      const pdfBytes = await this.renderService.render(template, invoice);
      const xmlString = this.xmlService.generate(invoice);
      const zugferdBytes = await this.zugferdService.embed(pdfBytes, xmlString);
      const filename = `${invoice.invoiceNumber}-ZUGFeRD.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(zugferdBytes));
    } catch (err) {
      console.error('ZUGFeRD export error:', err);
      res.status(500).json({ error: 'ZUGFeRD-Export fehlgeschlagen' });
    }
  };
}
