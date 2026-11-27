import { type InvoiceInstallmentItem } from "../../../database";
import {
  formatFullDate,
  formatMonthLabel,
  parseDateKeyToLocalDate,
} from "../../../shared/utils/format";

export type InvoiceBadgeTone = "success" | "danger" | "warning" | "muted";

export interface InvoiceStatusBadge {
  label: string;
  tone: InvoiceBadgeTone;
}

export function getInvoiceInstallmentBadge(
  item: InvoiceInstallmentItem
): InvoiceStatusBadge {
  if (item.status === "PAID") {
    return { label: "Pago", tone: "success" };
  }

  if (item.isOverdue) {
    return { label: "Vencida", tone: "danger" };
  }

  if (item.paidAmount > 0) {
    return { label: "Parcial", tone: "warning" };
  }

  return { label: "Pendente", tone: "muted" };
}

export function getLimitUsagePercent(
  limitAmount: number,
  usedLimit: number
): number {
  if (limitAmount <= 0) {
    return usedLimit > 0 ? 100 : 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((usedLimit / limitAmount) * 100))
  );
}

export function parseDayInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return Number.NaN;
  }

  const day = Number(trimmed);
  if (day < 1 || day > 31) {
    return Number.NaN;
  }

  return day;
}

export function formatInvoiceMonthLabel(monthKey: string): string {
  return formatMonthLabel(monthKey);
}

export function formatInvoiceDueDate(dateKey: string): string {
  return formatFullDate(parseDateKeyToLocalDate(dateKey));
}
