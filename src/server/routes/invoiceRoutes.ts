import { Router } from 'express';
import { InvoiceController } from '../controllers/InvoiceController.js';
import { EmailController } from '../controllers/EmailController.js';

const router = Router();
const controller = new InvoiceController();
const emailController = new EmailController();

/**
 * @swagger
 * components:
 *   schemas:
 *     Seller:
 *       type: object
 *       required: [name, street, city, postalCode, countryCode]
 *       properties:
 *         name: { type: string }
 *         street: { type: string }
 *         city: { type: string }
 *         postalCode: { type: string }
 *         countryCode: { type: string }
 *         vatId: { type: string }
 *         taxNumber: { type: string }
 *         contactName: { type: string }
 *         contactPhone: { type: string }
 *         contactEmail: { type: string }
 *     Buyer:
 *       type: object
 *       required: [name, street, city, postalCode, countryCode]
 *       properties:
 *         name: { type: string }
 *         street: { type: string }
 *         city: { type: string }
 *         postalCode: { type: string }
 *         countryCode: { type: string }
 *         vatId: { type: string }
 *         email: { type: string }
 *     InvoiceLine:
 *       type: object
 *       required: [lineNumber, quantity, unitCode, itemName, netPrice, vatCategoryCode, vatRate, lineNetAmount]
 *       properties:
 *         lineNumber: { type: integer }
 *         quantity: { type: number }
 *         unitCode: { type: string }
 *         itemName: { type: string }
 *         netPrice: { type: number }
 *         vatCategoryCode: { type: string }
 *         vatRate: { type: number }
 *         lineNetAmount: { type: number }
 *     Invoice:
 *       type: object
 *       required: [invoiceNumber, invoiceDate, invoiceTypeCode, currencyCode, seller, buyer, paymentMeansCode, taxCategoryCode, taxRate, lines]
 *       properties:
 *         id: { type: integer, readOnly: true }
 *         invoiceNumber: { type: string }
 *         invoiceDate: { type: string, format: date }
 *         invoiceTypeCode: { type: string }
 *         currencyCode: { type: string }
 *         dueDate: { type: string, format: date }
 *         seller: { $ref: '#/components/schemas/Seller' }
 *         buyer: { $ref: '#/components/schemas/Buyer' }
 *         paymentMeansCode: { type: string }
 *         paymentTerms: { type: string }
 *         iban: { type: string }
 *         bic: { type: string }
 *         taxCategoryCode: { type: string }
 *         taxRate: { type: number }
 *         totalNetAmount: { type: number, readOnly: true }
 *         totalTaxAmount: { type: number, readOnly: true }
 *         totalGrossAmount: { type: number, readOnly: true }
 *         amountDue: { type: number, readOnly: true }
 *         lines: { type: array, items: { $ref: '#/components/schemas/InvoiceLine' } }
 *     InvoiceSummary:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         invoiceNumber: { type: string }
 *         invoiceDate: { type: string }
 *         buyerName: { type: string }
 *         totalGrossAmount: { type: number }
 *         currencyCode: { type: string }
 *         updatedAt: { type: string }
 */

/**
 * @swagger
 * /api/v1/invoices:
 *   get:
 *     summary: List all invoices
 *     tags: [Invoices]
 *     responses:
 *       200:
 *         description: Array of invoice summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InvoiceSummary'
 */
router.get('/', controller.listAll);

/**
 * @swagger
 * /api/v1/invoices:
 *   post:
 *     summary: Create a new invoice
 *     tags: [Invoices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Invoice'
 *     responses:
 *       201:
 *         description: Created invoice
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invoice'
 *       400:
 *         description: Validation error
 */
router.post('/', controller.create);

/**
 * @swagger
 * /api/v1/invoices/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Invoice with line items
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invoice'
 *       404:
 *         description: Not found
 */
router.get('/:id', controller.getById);

/**
 * @swagger
 * /api/v1/invoices/{id}:
 *   put:
 *     summary: Update an invoice
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Invoice'
 *     responses:
 *       200:
 *         description: Updated invoice
 *       404:
 *         description: Not found
 */
router.put('/:id', controller.update);

/**
 * @swagger
 * /api/v1/invoices/{id}:
 *   delete:
 *     summary: Delete an invoice
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete('/:id', controller.delete);

/**
 * @swagger
 * /api/v1/invoices/{id}/duplicate:
 *   post:
 *     summary: Duplicate an invoice
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Duplicated invoice
 *       404:
 *         description: Not found
 */
router.post('/:id/duplicate', controller.duplicate);

/**
 * @swagger
 * /api/v1/invoices/{id}/send-email:
 *   post:
 *     summary: Send invoice by email
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientEmail, templateId, attachmentType]
 *             properties:
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               templateId:
 *                 type: integer
 *               attachmentType:
 *                 type: string
 *                 enum: [zugferd, xml, zugferd+xml]
 *               pdfTemplateId:
 *                 type: integer
 *               cc:
 *                 type: string
 *               bcc:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent successfully, returns log entry
 *       400:
 *         description: Validation error
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Send failed
 */
router.post('/:id/send-email', emailController.sendEmail);

export default router;
