import { Router } from 'express';
import { ImportController } from '../controllers/ImportController.js';

const router = Router();
const controller = new ImportController();

/**
 * @swagger
 * /api/v1/invoices/import/preview:
 *   post:
 *     summary: Parse XRechnung/UBL XML and preview as invoice
 *     tags: [Import]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - xml
 *             properties:
 *               xml:
 *                 type: string
 *                 description: Raw XRechnung or ZUGFeRD/UBL XML content
 *     responses:
 *       200:
 *         description: Parsed invoice preview with warnings (not saved to DB)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoice:
 *                   $ref: '#/components/schemas/InvoiceDto'
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Non-fatal warnings about the parsed invoice (e.g. missing contact, invalid IBAN)
 *       400:
 *         description: Missing or malformed XML
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.post('/import/preview', controller.previewImport);

export default router;
