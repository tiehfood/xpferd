import { z } from 'zod';
import validator from 'validator';

const sellerSchema = z.object({
  name: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  countryCode: z.string().length(2),
  vatId: z.string().optional(),
  taxNumber: z.string().optional(),
  contactName: z.string().min(1, 'Pflichtfeld für XRechnung (BR-DE-2)'),
  contactPhone: z.string().min(1, 'Pflichtfeld für XRechnung (BR-DE-2)'),
  contactEmail: z.string().email('Ungültige E-Mail-Adresse').min(1, 'Pflichtfeld für XRechnung (PEPPOL-R020)'),
});

const buyerSchema = z.object({
  name: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  countryCode: z.string().length(2),
  vatId: z.string().optional(),
  email: z.string().email('Ungültige E-Mail-Adresse').min(1, 'Pflichtfeld für XRechnung (PEPPOL-R010)'),
});

const invoiceLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCode: z.string().min(1),
  itemName: z.string().min(1),
  itemDescription: z.string().optional(),
  netPrice: z.number().min(0),
  vatCategoryCode: z.string().min(1),
  vatRate: z.number().min(0),
  lineNetAmount: z.number().min(0),
});

export const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceTypeCode: z.string().min(1),
  currencyCode: z.string().length(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  buyerReference: z.string().optional().or(z.literal('')),
  note: z.string().optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  orderReference: z.string().optional(),
  contractReference: z.string().optional(),

  seller: sellerSchema,
  buyer: buyerSchema,

  paymentMeansCode: z.string().min(1),
  paymentTerms: z.string().optional(),
  iban: z.string().optional().or(z.literal('')).refine(
    (val) => !val || validator.isIBAN(val.replace(/\s/g, '')),
    { message: 'Ungültige IBAN' },
  ),
  bic: z.string().optional().or(z.literal('')).refine(
    (val) => !val || validator.isBIC(val),
    { message: 'Ungültiger BIC' },
  ),
  paymentReference: z.string().optional(),
  accountName: z.string().optional(),

  taxCategoryCode: z.string().min(1),
  taxRate: z.number().min(0),

  kleinunternehmer: z.boolean(),
  prepaidAmount: z.number().min(0).optional(),

  lines: z.array(invoiceLineSchema).min(1),
}).refine(
  // BR-CO-25: due date or payment terms required when amount > 0
  (data) => {
    const hasPositiveAmount = data.lines.some(l => l.lineNetAmount > 0);
    if (!hasPositiveAmount) return true;
    return !!(data.dueDate || data.paymentTerms);
  },
  { message: 'Fälligkeitsdatum oder Zahlungsbedingungen erforderlich (BR-CO-25)', path: ['dueDate'] },
).refine(
  // BR-CO-26 / BR-DE-16: seller must have vatId or taxNumber
  (data) => {
    const cats = ['S', 'Z', 'E', 'AE', 'K', 'G', 'L', 'M'];
    if (!cats.includes(data.taxCategoryCode)) return true;
    return !!(data.seller.vatId || data.seller.taxNumber);
  },
  { message: 'USt-IdNr. oder Steuernummer des Verkäufers erforderlich (BR-DE-16)', path: ['seller', 'vatId'] },
);

export type InvoiceInput = z.infer<typeof invoiceSchema>;
