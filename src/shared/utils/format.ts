const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDayMonth(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long" });
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export const HIDDEN_MONEY = "R$ ••••";

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseAmount(value: string): number {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(normalized);
}

export function formatAmountInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}
