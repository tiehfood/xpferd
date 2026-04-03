import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailSettingsDto, EmailTemplateDto, EmailLogDto, SendEmailRequest, InvoiceDto } from '../../shared/types/index.js';
import { EmailSettingsModel } from '../models/EmailSettings.js';
import { EmailTemplateModel } from '../models/EmailTemplate.js';
import { EmailLogModel } from '../models/EmailLog.js';
import { Database } from '../database/Database.js';
import { InvoiceService } from './InvoiceService.js';
import { PdfTemplateService } from './PdfTemplateService.js';
import { PdfRenderService } from './PdfRenderService.js';
import { XRechnungXmlService } from './XRechnungXmlService.js';
import { ZUGFeRDService } from './ZUGFeRDService.js';
import { htmlToText } from '../../shared/utils/htmlToText.js';

export class EmailService {
  private get settingsModel() {
    return new EmailSettingsModel(Database.getInstance().getDb());
  }

  private get templateModel() {
    return new EmailTemplateModel(Database.getInstance().getDb());
  }

  private get logModel() {
    return new EmailLogModel(Database.getInstance().getDb());
  }

  private get invoiceService() {
    return new InvoiceService();
  }

  private get pdfTemplateService() {
    return new PdfTemplateService();
  }

  private get renderService() {
    return new PdfRenderService();
  }

  private get xmlService() {
    return new XRechnungXmlService();
  }

  private get zugferdService() {
    return new ZUGFeRDService();
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  getSettings(): EmailSettingsDto {
    return this.settingsModel.get();
  }

  updateSettings(dto: EmailSettingsDto): EmailSettingsDto {
    return this.settingsModel.update(dto);
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  listTemplates(): EmailTemplateDto[] {
    return this.templateModel.findAll();
  }

  getTemplate(id: number): EmailTemplateDto | null {
    return this.templateModel.findById(id);
  }

  createTemplate(dto: EmailTemplateDto): EmailTemplateDto {
    return this.templateModel.create(dto);
  }

  updateTemplate(id: number, dto: EmailTemplateDto): EmailTemplateDto | null {
    return this.templateModel.update(id, dto);
  }

  deleteTemplate(id: number): boolean {
    return this.templateModel.delete(id);
  }

  // ─── Send ─────────────────────────────────────────────────────────────────

  async sendInvoiceEmail(invoiceId: number, params: SendEmailRequest): Promise<EmailLogDto> {
    // 1. Load invoice
    const invoice = this.invoiceService.getById(invoiceId);
    if (!invoice) throw new Error('Rechnung nicht gefunden');

    // 2. Load email settings
    const settings = this.settingsModel.get();
    if (!settings.smtpHost) throw new Error('SMTP nicht konfiguriert');

    // 3. Load email template and render
    const template = this.templateModel.findById(params.templateId);
    if (!template) throw new Error('E-Mail-Vorlage nicht gefunden');
    const rendered = this.renderTemplate(template, invoice);

    // 4. Lookup PDF template name if relevant
    let pdfTemplateName: string | undefined;
    if (params.pdfTemplateId) {
      const pdfTemplate = this.pdfTemplateService.getById(params.pdfTemplateId);
      pdfTemplateName = pdfTemplate?.name;
    }

    // 5. Generate attachments
    const attachments = await this.generateAttachments(invoice, params.attachmentType, params.pdfTemplateId);

    // 6. Create transport and send
    const transport = this.createTransport(settings);
    try {
      await transport.sendMail({
        from: settings.fromName
          ? `"${settings.fromName}" <${settings.fromAddress}>`
          : settings.fromAddress,
        replyTo: settings.replyTo || undefined,
        to: params.recipientEmail,
        cc: params.cc || undefined,
        bcc: params.bcc || undefined,
        subject: rendered.subject,
        text: rendered.body,
        ...(rendered.bodyHtml ? { html: rendered.bodyHtml } : {}),
        attachments,
      });

      // 7. Log success
      return this.logModel.create({
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        recipientEmail: params.recipientEmail,
        subject: rendered.subject,
        attachmentType: params.attachmentType,
        pdfTemplateId: params.pdfTemplateId,
        pdfTemplateName,
        sentAt: new Date().toISOString(),
        status: 'success',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logModel.create({
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        recipientEmail: params.recipientEmail,
        subject: rendered.subject,
        attachmentType: params.attachmentType,
        pdfTemplateId: params.pdfTemplateId,
        pdfTemplateName,
        sentAt: new Date().toISOString(),
        status: 'error',
        errorMessage,
      });
      throw new Error(`E-Mail-Versand fehlgeschlagen: ${errorMessage}`);
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    const settings = this.settingsModel.get();
    if (!settings.smtpHost) {
      return { success: false, error: 'SMTP-Host nicht konfiguriert' };
    }
    const transport = this.createTransport(settings);
    try {
      await transport.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Log ──────────────────────────────────────────────────────────────────

  getLog(limit: number = 100): EmailLogDto[] {
    return this.logModel.findAll(limit);
  }

  getLogForInvoice(invoiceId: number): EmailLogDto[] {
    return this.logModel.findByInvoiceId(invoiceId);
  }

  // ─── Template rendering ───────────────────────────────────────────────────

  renderTemplate(
    template: EmailTemplateDto,
    invoice: InvoiceDto,
  ): { subject: string; body: string; bodyHtml?: string } {
    const replacements: Record<string, string> = {
      '{rechnungsnummer}': invoice.invoiceNumber || '',
      '{rechnungsdatum}': invoice.invoiceDate || '',
      '{fälligkeitsdatum}': invoice.dueDate || '',
      '{betrag_brutto}': invoice.totalGrossAmount?.toFixed(2) || '0.00',
      '{betrag_netto}': invoice.totalNetAmount?.toFixed(2) || '0.00',
      '{währung}': invoice.currencyCode || 'EUR',
      '{empfänger}': invoice.buyer?.name || '',
      '{verkäufer}': invoice.seller?.name || '',
      '{iban}': invoice.iban || '',
      '{verwendungszweck}': invoice.paymentReference || '',
    };

    let subject = template.subject;
    let body = template.body;
    let bodyHtml = template.bodyHtml;
    for (const [placeholder, value] of Object.entries(replacements)) {
      subject = subject.replaceAll(placeholder, value);
      body = body.replaceAll(placeholder, value);
      if (bodyHtml) {
        bodyHtml = bodyHtml.replaceAll(placeholder, value);
      }
    }
    // Auto-generate plain text from HTML if text body is missing/minimal
    if (bodyHtml && (!body.trim() || body.trim().length < 10)) {
      body = htmlToText(bodyHtml);
    }

    return { subject, body, ...(bodyHtml ? { bodyHtml } : {}) };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async generateAttachments(
    invoice: InvoiceDto,
    attachmentType: 'zugferd' | 'xml' | 'zugferd+xml',
    pdfTemplateId?: number,
  ): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

    if (attachmentType === 'xml' || attachmentType === 'zugferd+xml') {
      const xml = this.xmlService.generate(invoice);
      attachments.push({
        filename: `${invoice.invoiceNumber}.xml`,
        content: Buffer.from(xml, 'utf-8'),
        contentType: 'application/xml',
      });
    }

    if (attachmentType === 'zugferd' || attachmentType === 'zugferd+xml') {
      if (!pdfTemplateId) throw new Error('PDF-Vorlage erforderlich für ZUGFeRD-Anhang');
      const pdfTemplate = this.pdfTemplateService.getById(pdfTemplateId);
      if (!pdfTemplate) throw new Error('PDF-Vorlage nicht gefunden');
      const pdfBytes = await this.renderService.render(pdfTemplate, invoice);
      const xmlString = this.xmlService.generate(invoice);
      const zugferdBytes = await this.zugferdService.embed(pdfBytes, xmlString);
      attachments.push({
        filename: `${invoice.invoiceNumber}.pdf`,
        content: Buffer.from(zugferdBytes),
        contentType: 'application/pdf',
      });
    }

    return attachments;
  }

  private createTransport(settings: EmailSettingsDto): Transporter {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: settings.smtpUser
        ? {
            user: settings.smtpUser,
            pass: settings.smtpPass,
          }
        : undefined,
    });
  }
}
