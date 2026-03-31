import { z } from 'zod';

export const recurringInvoiceSchema = z.object({
  name: z.string().min(1),
  invoiceTemplateId: z.number().int().positive(),
  invoiceNumberTemplateId: z.number().int().positive().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  monthPosition: z.enum(['first', 'last']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDateOffsetDays: z.number().int().min(0).default(30),
  deliveryDateOffsetDays: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
}).refine(data => {
  // Monthly/quarterly schedules require dayOfMonth or monthPosition
  if (data.frequency === 'monthly' || data.frequency === 'quarterly') {
    return data.dayOfMonth !== undefined || data.monthPosition !== undefined;
  }
  return true;
}, {
  message: 'Monthly/quarterly schedules require dayOfMonth or monthPosition',
});

export type RecurringInvoiceInput = z.infer<typeof recurringInvoiceSchema>;
