import { DatabaseError } from "./errors";

const MONTH_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE_PREFIX_REGEX =
  /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

function isValidCalendarDate(
  year: number,
  month: number,
  day: number
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_REGEX.test(value);
}

export function assertMonthKey(value: string): string {
  const trimmed = value.trim();
  if (!isValidMonthKey(trimmed)) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Mês inválido. Use o formato AAAA-MM."
    );
  }

  return trimmed;
}

export function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_REGEX.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidCalendarDate(year, month, day);
}

export function normalizeDateKey(value: string): string {
  const trimmed = value.trim();
  const prefixMatch = ISO_DATE_PREFIX_REGEX.exec(trimmed);
  if (!prefixMatch) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Data inválida. Use o formato AAAA-MM-DD."
    );
  }

  const datePart = prefixMatch[1];
  if (!isValidDateKey(datePart) || Number.isNaN(Date.parse(trimmed))) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Data inválida. Use o formato AAAA-MM-DD."
    );
  }

  return datePart;
}

export function getMonthDateRange(monthKey: string): {
  start: string;
  end: string;
} {
  const validMonthKey = assertMonthKey(monthKey);
  const [yearStr, monthStr] = validMonthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${validMonthKey}-01`,
    end: `${validMonthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function addMonthsToMonthKey(monthKey: string, delta: number): string {
  const validMonthKey = assertMonthKey(monthKey);
  if (!Number.isInteger(delta)) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Deslocamento de meses deve ser um número inteiro."
    );
  }

  const [yearStr, monthStr] = validMonthKey.split("-");
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = ((totalMonths % 12) + 12) % 12;

  if (nextYear < 1 || nextYear > 9999) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "O ano resultante deve estar entre 0001 e 9999."
    );
  }

  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}`;
}

export function addMonthsToDateKey(dateKey: string, delta: number): string {
  const validDateKey = normalizeDateKey(dateKey);
  if (!Number.isInteger(delta)) {
    throw new DatabaseError(
      "VALIDATION_ERROR",
      "Deslocamento de meses deve ser um número inteiro."
    );
  }

  const day = Number(validDateKey.slice(8, 10));
  const targetMonthKey = addMonthsToMonthKey(validDateKey.slice(0, 7), delta);
  const [targetYearStr, targetMonthStr] = targetMonthKey.split("-");
  const lastDay = new Date(
    Date.UTC(Number(targetYearStr), Number(targetMonthStr), 0)
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDay);

  return `${targetMonthKey}-${String(clampedDay).padStart(2, "0")}`;
}

export function toLocalDateKey(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
