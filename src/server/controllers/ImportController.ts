import type { Request, Response } from 'express';
import { XmlImportService } from '../services/XmlImportService.js';

export class ImportController {
  private service = new XmlImportService();

  previewImport = (req: Request, res: Response): void => {
    const xml: string = req.body?.xml;

    if (!xml || typeof xml !== 'string' || xml.trim() === '') {
      res.status(400).json({ error: 'XML-Inhalt fehlt' });
      return;
    }

    try {
      const dto = this.service.parse(xml);
      res.status(200).json(dto);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      res.status(400).json({ error: message });
    }
  };
}
