import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import invoiceRoutes from './routes/invoiceRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import partyRoutes from './routes/partyRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import pdfTemplateRoutes from './routes/pdfTemplateRoutes.js';
import appSettingsRoutes from './routes/appSettingsRoutes.js';
import importRoutes from './routes/importRoutes.js';
import recurringInvoiceRoutes from './routes/recurringInvoiceRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Swagger
  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'XRechnung API',
        version: '1.0.0',
        description: 'REST API for managing and exporting XRechnung invoices',
      },
      servers: [{ url: 'http://localhost:3000' }],
    },
    apis: [path.resolve(__dirname, './routes/*.ts'), path.resolve(__dirname, './routes/*.js')],
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // API routes
  app.use('/api/v1/invoices', invoiceRoutes);
  app.use('/api/v1/invoices', exportRoutes);
  app.use('/api/v1/invoices', importRoutes);
  app.use('/api/v1/parties', partyRoutes);
  app.use('/api/v1/templates', templateRoutes);
  app.use('/api/v1/pdf-templates', pdfTemplateRoutes);
  app.use('/api/v1/settings', appSettingsRoutes);
  app.use('/api/v1/recurring-invoices', recurringInvoiceRoutes);

  // API 404 handler — return JSON, not HTML, for unmatched API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Serve icons directory
  const iconsDir = path.resolve(__dirname, '../..', 'docs/icons');
  app.use('/icons', express.static(iconsDir));

  // Serve frontend static files
  const clientDir = path.resolve(__dirname, '../../dist/client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Interner Serverfehler' });
  });

  return app;
}
