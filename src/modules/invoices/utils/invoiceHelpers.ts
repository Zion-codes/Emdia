import {
  type InvoiceInstallmentItem,
  isDatabaseError,
} from "../../../database";
import {
  capitalizeFirst,
  formatFullDate,
  formatMonthYear,
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
  const [year, month] = monthKey.split("-").map(Number);
  return capitalizeFirst(formatMonthYear(new Date(year, month - 1, 1)));
}

export function formatInvoiceDueDate(dateKey: string): string {
  const [year, month, day] = dateKey.slice(0, 10).split("-").map(Number);
  return formatFullDate(new Date(year, month - 1, day));
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isDatabaseError(error) && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
