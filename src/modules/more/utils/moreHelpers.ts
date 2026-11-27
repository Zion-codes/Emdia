import {
  capitalizeFirst,
  formatMonthYear,
  parseAmount,
} from "../../../shared/utils/format";
import { isDatabaseError } from "../../../database";

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return capitalizeFirst(formatMonthYear(new Date(year, month - 1, 1)));
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isDatabaseError(error) && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function requireText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export type MoneyInputResult = {
  status: "empty" | "valid" | "invalid";
  amount: number | null;
};

export function parseMoneyInput(
  value: string,
  options: { allowZero?: boolean } = {}
): MoneyInputResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { status: "empty", amount: null };
  }

  const parsed = parseAmount(trimmed);
  const cents = Number.isFinite(parsed)
    ? Math.round((parsed + Number.EPSILON) * 100)
    : Number.NaN;
  const minimum = options.allowZero ? 0 : 1;

  if (
    !Number.isFinite(parsed) ||
    cents < minimum ||
    !Number.isSafeInteger(cents)
  ) {
    return { status: "invalid", amount: null };
  }

  return { status: "valid", amount: parsed };
}

export function parseDateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}
