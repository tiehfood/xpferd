import type { RecurringInvoiceDto, RecurringInvoiceLogDto, InvoiceDto } from '../../shared/types/index.js';
import { RecurringInvoiceModel } from '../models/RecurringInvoice.js';
import { RecurringInvoiceLogModel } from '../models/RecurringInvoiceLog.js';
import { InvoiceTemplateModel } from '../models/InvoiceTemplate.js';
import { Database } from '../database/Database.js';
import { InvoiceService } from './InvoiceService.js';
import { InvoiceNumberTemplateService } from './InvoiceNumberTemplateService.js';
import { computeNextDate, computeOccurrences, addDays } from '../../shared/utils/recurringDates.js';
import type { RecurringRule } from '../../shared/utils/recurringDates.js';

export class RecurringInvoiceService {
  private get model(): RecurringInvoiceModel {
    return new RecurringInvoiceModel(Database.getInstance().getDb());
  }

  private get logModel(): RecurringInvoiceLogModel {
    return new RecurringInvoiceLogModel(Database.getInstance().getDb());
  }

  private get invoiceService(): InvoiceService {
    return new InvoiceService();
  }

  private get invoiceTemplateModel(): InvoiceTemplateModel {
    return new InvoiceTemplateModel(Database.getInstance().getDb());
  }

  private get invoiceNumberTemplateService(): InvoiceNumberTemplateService {
    return new InvoiceNumberTemplateService();
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  listAll(): RecurringInvoiceDto[] {
    return this.model.findAll();
  }

  getById(id: number): RecurringInvoiceDto | null {
    return this.model.findById(id);
  }

  create(dto: RecurringInvoiceDto): RecurringInvoiceDto {
    const created = this.model.create(dto);
    // Compute the initial nextScheduledDate
    const nextDate = this.computeInitialNextDate(created);
    if (nextDate !== created.nextScheduledDate) {
      return this.model.update(created.id!, {
        ...created,
        nextScheduledDate: nextDate ?? undefined,
      }) ?? created;
    }
    return created;
  }

  update(id: number, dto: RecurringInvoiceDto): RecurringInvoiceDto | null {
    const existing = this.model.findById(id);
    if (!existing) return null;
    const updated = this.model.update(id, dto);
    if (!updated) return null;
    // Recompute nextScheduledDate based on updated rule
    const nextDate = this.computeInitialNextDate(updated);
    if (nextDate !== updated.nextScheduledDate) {
      return this.model.update(id, {
        ...updated,
        nextScheduledDate: nextDate ?? undefined,
      });
    }
    return updated;
  }

  delete(id: number): boolean {
    return this.model.delete(id);
  }

  toggleActive(id: number): RecurringInvoiceDto | null {
    const existing = this.model.findById(id);
    if (!existing) return null;
    const newActive = !existing.active;
    const updated = this.model.update(id, { ...existing, active: newActive });
    if (!updated) return null;
    // If reactivating, recompute nextScheduledDate
    if (newActive) {
      const nextDate = this.computeInitialNextDate(updated);
      if (nextDate !== updated.nextScheduledDate) {
        return this.model.update(id, {
          ...updated,
          nextScheduledDate: nextDate ?? undefined,
        });
      }
    }
    return this.model.findById(id);
  }

  // ─── Generation ──────────────────────────────────────────────────────────

  generateInvoice(recurringId: number): { invoiceId: number } | { error: string } {
    const rule = this.model.findById(recurringId);
    if (!rule) {
      return { error: `Recurring invoice rule ${recurringId} not found` };
    }
    if (!rule.active) {
      return { error: `Recurring invoice rule ${recurringId} is inactive` };
    }

    const scheduledDate = rule.nextScheduledDate ?? rule.startDate;

    // Load the invoice template
    const template = this.invoiceTemplateModel.findById(rule.invoiceTemplateId);
    if (!template) {
      return { error: `Invoice template ${rule.invoiceTemplateId} not found` };
    }

    let invoiceData: InvoiceDto;
    try {
      invoiceData = JSON.parse(template.data) as InvoiceDto;
    } catch {
      return { error: `Failed to parse invoice template data for template ${rule.invoiceTemplateId}` };
    }

    // Strip identity fields so we create a fresh invoice
    delete invoiceData.id;
    delete invoiceData.createdAt;
    delete invoiceData.updatedAt;

    // Set date fields
    invoiceData.invoiceDate = scheduledDate;
    invoiceData.dueDate = addDays(scheduledDate, rule.dueDateOffsetDays);
    if (rule.deliveryDateOffsetDays > 0) {
      invoiceData.deliveryDate = addDays(scheduledDate, rule.deliveryDateOffsetDays);
    }

    // Generate invoice number if a number template is configured
    if (rule.invoiceNumberTemplateId) {
      const numberResult = this.invoiceNumberTemplateService.generateNext(rule.invoiceNumberTemplateId);
      if (numberResult) {
        invoiceData.invoiceNumber = numberResult.invoiceNumber;
      }
    }

    // Mark as auto-generated
    invoiceData.autoGenerated = true;

    // Create the invoice
    let createdInvoice: InvoiceDto;
    try {
      createdInvoice = this.invoiceService.create(invoiceData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Log the error
      this.logModel.create({
        recurringInvoiceId: recurringId,
        scheduledDate,
        generatedAt: new Date().toISOString(),
        status: 'error',
        errorMessage,
      });
      return { error: errorMessage };
    }

    // Log success
    this.logModel.create({
      recurringInvoiceId: recurringId,
      invoiceId: createdInvoice.id,
      scheduledDate,
      generatedAt: new Date().toISOString(),
      status: 'success',
    });

    // Advance the schedule state
    const recurringRule: RecurringRule = this.toRecurringRule(rule);
    const nextScheduled = computeNextDate(recurringRule, scheduledDate);
    this.model.updateScheduleState(
      recurringId,
      scheduledDate,
      nextScheduled,
    );

    return { invoiceId: createdInvoice.id! };
  }

  generateDueInvoices(): { generated: number; errors: number } {
    const today = new Date().toISOString().slice(0, 10);
    const dueRules = this.model.findDue(today);

    let generated = 0;
    let errors = 0;

    for (const rule of dueRules) {
      if (!rule.id) continue;

      // Catch-up: generate one invoice per overdue occurrence
      let current = this.model.findById(rule.id);
      while (current && current.nextScheduledDate && current.nextScheduledDate <= today) {
        const result = this.generateInvoice(rule.id);
        if ('error' in result) {
          errors++;
          // Break out of catch-up loop on error to avoid infinite loops
          break;
        } else {
          generated++;
        }
        // Reload to check updated nextScheduledDate
        current = this.model.findById(rule.id);
        // Stop if endDate passed
        if (current?.endDate && today > current.endDate) break;
      }
    }

    return { generated, errors };
  }

  // ─── Preview ─────────────────────────────────────────────────────────────

  previewOccurrences(ruleDto: Partial<RecurringInvoiceDto>, months: number): string[] {
    if (!ruleDto.frequency || !ruleDto.startDate) return [];

    const rule: RecurringRule = {
      frequency: ruleDto.frequency,
      dayOfWeek: ruleDto.dayOfWeek,
      dayOfMonth: ruleDto.dayOfMonth,
      monthPosition: ruleDto.monthPosition,
      startDate: ruleDto.startDate,
      endDate: ruleDto.endDate,
    };

    const today = new Date().toISOString().slice(0, 10);
    const toDate = addDays(today, months * 30);

    return computeOccurrences(rule, today, toDate);
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  getLogs(recurringId: number, limit?: number): RecurringInvoiceLogDto[] {
    const logs = this.logModel.findByRecurringId(recurringId);
    return limit ? logs.slice(0, limit) : logs;
  }

  getAllLogs(limit?: number): RecurringInvoiceLogDto[] {
    return this.logModel.findAll(limit ?? 100);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toRecurringRule(dto: RecurringInvoiceDto): RecurringRule {
    return {
      frequency: dto.frequency,
      dayOfWeek: dto.dayOfWeek,
      dayOfMonth: dto.dayOfMonth,
      monthPosition: dto.monthPosition,
      startDate: dto.startDate,
      endDate: dto.endDate,
    };
  }

  private computeInitialNextDate(dto: RecurringInvoiceDto): string | null {
    const rule = this.toRecurringRule(dto);
    // Compute next date after "yesterday relative to startDate" to get the first valid date >= startDate
    const yesterday = addDays(dto.startDate, -1);
    return computeNextDate(rule, yesterday);
  }
}
