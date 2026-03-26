import type { Request, Response } from 'express';
import { XmlImportService } from '../services/XmlImportService.js';
import { ImportWarningService } from '../services/ImportWarningService.js';

export class ImportController {
  private service = new XmlImportService();
  private warningService = new ImportWarningService();

  previewImport = (req: Request, res: Response): void => {
    const xml: string = req.body?.xml;

    if (!xml || typeof xml !== 'string' || xml.trim() === '') {
      res.status(400).json({ error: 'XML-Inhalt fehlt' });
      return;
    }

    try {
      const invoice = this.service.parse(xml);
      const warnings = this.warningService.check(invoice);
      res.status(200).json({ invoice, warnings });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      res.status(400).json({ error: message });
    }
  };
}
