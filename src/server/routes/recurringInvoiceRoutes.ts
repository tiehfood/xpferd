import { Router } from 'express';
import { RecurringInvoiceController } from '../controllers/RecurringInvoiceController.js';

const router = Router();
const controller = new RecurringInvoiceController();

/**
 * @swagger
 * components:
 *   schemas:
 *     RecurringInvoice:
 *       type: object
 *       required: [name, invoiceTemplateId, frequency, startDate, dueDateOffsetDays, deliveryDateOffsetDays, active]
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         name:
 *           type: string
 *           description: Descriptive label for the recurring schedule
 *         invoiceTemplateId:
 *           type: integer
 *           description: References invoice_templates.id
 *         invoiceNumberTemplateId:
 *           type: integer
 *           description: Optional — for auto-number generation
 *         frequency:
 *           type: string
 *           enum: [weekly, biweekly, monthly, quarterly]
 *         dayOfWeek:
 *           type: integer
 *           minimum: 0
 *           maximum: 6
 *           description: ISO weekday (0=Monday, 6=Sunday) — for weekly/biweekly
 *         dayOfMonth:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *           description: Day of month (clamped to actual month length) — for monthly/quarterly
 *         monthPosition:
 *           type: string
 *           enum: [first, last]
 *           description: Alternative to dayOfMonth — use 1st or last day of month
 *         startDate:
 *           type: string
 *           format: date
 *         endDate:
 *           type: string
 *           format: date
 *           description: Optional — indefinite if omitted
 *         dueDateOffsetDays:
 *           type: integer
 *           minimum: 0
 *           default: 30
 *         deliveryDateOffsetDays:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         active:
 *           type: boolean
 *           default: true
 *         lastGeneratedDate:
 *           type: string
 *           format: date
 *           readOnly: true
 *         nextScheduledDate:
 *           type: string
 *           format: date
 *           readOnly: true
 *         createdAt:
 *           type: string
 *           readOnly: true
 *         updatedAt:
 *           type: string
 *           readOnly: true
 *     RecurringInvoiceLog:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         recurringInvoiceId:
 *           type: integer
 *         invoiceId:
 *           type: integer
 *           description: Created invoice ID (null on error)
 *         scheduledDate:
 *           type: string
 *           format: date
 *         generatedAt:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [success, error]
 *         errorMessage:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/recurring-invoices:
 *   get:
 *     summary: List all recurring invoice schedules
 *     tags: [RecurringInvoices]
 *     responses:
 *       200:
 *         description: Array of recurring invoice schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RecurringInvoice'
 */
router.get('/', controller.list);

/**
 * @swagger
 * /api/v1/recurring-invoices:
 *   post:
 *     summary: Create a new recurring invoice schedule
 *     tags: [RecurringInvoices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecurringInvoice'
 *     responses:
 *       201:
 *         description: Created recurring invoice schedule
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RecurringInvoice'
 *       400:
 *         description: Validation error
 */
router.post('/', controller.create);

/**
 * @swagger
 * /api/v1/recurring-invoices/logs:
 *   get:
 *     summary: Get all generation logs (audit page)
 *     tags: [RecurringInvoices]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *         description: Maximum number of log entries to return (default 100)
 *     responses:
 *       200:
 *         description: Array of log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RecurringInvoiceLog'
 */
router.get('/logs', controller.getAllLogs);

/**
 * @swagger
 * /api/v1/recurring-invoices/preview-occurrences:
 *   post:
 *     summary: Preview upcoming occurrence dates for a (draft) schedule
 *     tags: [RecurringInvoices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               frequency:
 *                 type: string
 *                 enum: [weekly, biweekly, monthly, quarterly]
 *               dayOfWeek: { type: integer }
 *               dayOfMonth: { type: integer }
 *               monthPosition: { type: string, enum: [first, last] }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               months:
 *                 type: integer
 *                 description: How many months ahead to preview (default 3)
 *     responses:
 *       200:
 *         description: Array of upcoming occurrence dates (YYYY-MM-DD)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dates:
 *                   type: array
 *                   items: { type: string, format: date }
 */
router.post('/preview-occurrences', controller.previewOccurrences);

/**
 * @swagger
 * /api/v1/recurring-invoices/generate-all:
 *   post:
 *     summary: Trigger catch-up generation for all due schedules
 *     tags: [RecurringInvoices]
 *     responses:
 *       200:
 *         description: Summary of generation run
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated: { type: integer }
 *                 errors: { type: integer }
 */
router.post('/generate-all', controller.generateAll);

/**
 * @swagger
 * /api/v1/recurring-invoices/{id}:
 *   get:
 *     summary: Get a recurring invoice schedule by ID
 *     tags: [RecurringInvoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Recurring invoice schedule
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RecurringInvoice'
 *       404:
 *         description: Not found
 */
router.get('/:id', controller.getById);

/**
 * @swagger
 * /api/v1/recurring-invoices/{id}:
 *   put:
 *     summary: Update a recurring invoice schedule
 *     tags: [RecurringInvoices]
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
 *             $ref: '#/components/schemas/RecurringInvoice'
 *     responses:
 *       200:
 *         description: Updated recurring invoice schedule
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.put('/:id', controller.update);

/**
 * @swagger
 * /api/v1/recurring-invoices/{id}:
 *   delete:
 *     summary: Delete a recurring invoice schedule
 *     tags: [RecurringInvoices]
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
 * /api/v1/recurring-invoices/{id}/toggle:
 *   patch:
 *     summary: Toggle the active state of a recurring invoice schedule
 *     tags: [RecurringInvoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated recurring invoice schedule with toggled active state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RecurringInvoice'
 *       404:
 *         description: Not found
 */
router.patch('/:id/toggle', controller.toggleActive);

/**
 * @swagger
 * /api/v1/recurring-invoices/{id}/generate:
 *   post:
 *     summary: Manually trigger invoice generation for one schedule
 *     tags: [RecurringInvoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoiceId: { type: integer }
 *       400:
 *         description: Generation error (inactive rule, missing template, etc.)
 *       404:
 *         description: Recurring invoice not found
 */
router.post('/:id/generate', controller.generate);

/**
 * @swagger
 * /api/v1/recurring-invoices/{id}/logs:
 *   get:
 *     summary: Get generation logs for a specific recurring invoice schedule
 *     tags: [RecurringInvoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *         description: Maximum number of log entries to return
 *     responses:
 *       200:
 *         description: Array of log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RecurringInvoiceLog'
 */
router.get('/:id/logs', controller.getLogs);

export default router;
