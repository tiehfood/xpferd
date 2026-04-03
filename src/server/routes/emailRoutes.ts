import { Router } from 'express';
import { EmailController } from '../controllers/EmailController.js';

const router = Router();
const controller = new EmailController();

// ─── Settings ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/email/settings:
 *   get:
 *     summary: Get SMTP settings
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Current email settings (password is masked)
 */
router.get('/settings', controller.getSettings);

/**
 * @swagger
 * /api/v1/email/settings:
 *   put:
 *     summary: Update SMTP settings
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailSettings'
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 */
router.put('/settings', controller.updateSettings);

/**
 * @swagger
 * /api/v1/email/test-connection:
 *   post:
 *     summary: Test SMTP connection
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Connection test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
router.post('/test-connection', controller.testConnection);

// ─── Templates ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/email/templates:
 *   get:
 *     summary: List all email templates
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: Array of email templates
 */
router.get('/templates', controller.listTemplates);

/**
 * @swagger
 * /api/v1/email/templates/{id}:
 *   get:
 *     summary: Get an email template by ID
 *     tags: [Email]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Email template
 *       404:
 *         description: Not found
 */
router.get('/templates/:id', controller.getTemplate);

/**
 * @swagger
 * /api/v1/email/templates:
 *   post:
 *     summary: Create an email template
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailTemplate'
 *     responses:
 *       201:
 *         description: Created template
 *       400:
 *         description: Validation error
 */
router.post('/templates', controller.createTemplate);

/**
 * @swagger
 * /api/v1/email/templates/{id}:
 *   put:
 *     summary: Update an email template
 *     tags: [Email]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailTemplate'
 *     responses:
 *       200:
 *         description: Updated template
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.put('/templates/:id', controller.updateTemplate);

/**
 * @swagger
 * /api/v1/email/templates/{id}:
 *   delete:
 *     summary: Delete an email template
 *     tags: [Email]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete('/templates/:id', controller.deleteTemplate);

// ─── Log ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/email/log:
 *   get:
 *     summary: Get email send log (most recent first)
 *     tags: [Email]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Array of email log entries
 */
router.get('/log', controller.getLog);

/**
 * @swagger
 * /api/v1/email/log/invoice/{id}:
 *   get:
 *     summary: Get email log for a specific invoice
 *     tags: [Email]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Array of email log entries for the invoice
 */
router.get('/log/invoice/:id', controller.getLogForInvoice);

export default router;
