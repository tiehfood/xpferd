import { z } from 'zod';

export const emailSettingsSchema = z.object({
  smtpHost: z.string().max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().max(255),
  smtpPass: z.string().max(500),
  fromAddress: z.string().email().or(z.literal('')),
  fromName: z.string().max(255).optional(),
  replyTo: z.string().email().or(z.literal('')).optional(),
});

export const emailTemplateSchema = z
  .object({
    name: z.string().min(1).max(100),
    subject: z.string().min(1).max(500),
    body: z.string().max(10000),
    bodyHtml: z.string().max(500000).optional(),
    isDefault: z.boolean(),
  })
  .refine(
    (data) =>
      (data.body && data.body.trim().length > 0) ||
      (data.bodyHtml && data.bodyHtml.trim().length > 0),
    { message: 'Entweder Text- oder HTML-Inhalt erforderlich', path: ['body'] },
  );

export const sendEmailSchema = z
  .object({
    recipientEmail: z.string().email(),
    templateId: z.number().int().positive(),
    attachmentType: z.enum(['zugferd', 'xml', 'zugferd+xml']),
    pdfTemplateId: z.number().int().positive().optional(),
    cc: z.string().email().or(z.literal('')).optional(),
    bcc: z.string().email().or(z.literal('')).optional(),
  })
  .refine(
    (data) => {
      if (data.attachmentType === 'zugferd' || data.attachmentType === 'zugferd+xml') {
        return data.pdfTemplateId != null;
      }
      return true;
    },
    { message: 'PDF-Vorlage erforderlich für ZUGFeRD-Anhang', path: ['pdfTemplateId'] },
  );
