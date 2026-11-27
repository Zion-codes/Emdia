import {
  type AmountMode,
  distributeCents,
  fromCents,
  type RemainderDistribution,
  type TransactionListItem,
  type TransactionSortBy,
} from "../../../database";
import {
  formatFullDate,
  parseDateKeyToLocalDate,
} from "../../../shared/utils/format";

export type TransactionBadgeTone =
  "success" | "danger" | "warning" | "accent" | "muted";

export interface TransactionStatusBadge {
  label: string;
  tone: TransactionBadgeTone;
}

export interface InstallmentPreview {
  totalAmount: number;
  firstAmount: number;
  lastAmount: number;
}

export function formatDueDateLabel(dateKey: string): string {
  return formatFullDate(parseDateKeyToLocalDate(dateKey));
}

export function getTransactionStatusBadge(
  item: TransactionListItem
): TransactionStatusBadge {
  if (item.isProjected) {
    return { label: "Projetada", tone: "accent" };
  }

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

export function getInstallmentPreview(params: {
  amount: number;
  installmentsCount: number;
  amountMode: AmountMode;
  remainderDistribution: RemainderDistribution;
}): InstallmentPreview {
  const { amount, installmentsCount, amountMode, remainderDistribution } =
    params;

  if (!Number.isFinite(amount) || amount <= 0 || installmentsCount < 1) {
    return { totalAmount: 0, firstAmount: 0, lastAmount: 0 };
  }

  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (cents <= 0 || !Number.isSafeInteger(cents)) {
    return { totalAmount: 0, firstAmount: 0, lastAmount: 0 };
  }

  if (amountMode === "per_installment") {
    const totalCents = cents * installmentsCount;
    if (!Number.isSafeInteger(totalCents)) {
      return { totalAmount: 0, firstAmount: 0, lastAmount: 0 };
    }

    const perAmount = fromCents(cents);
    return {
      totalAmount: fromCents(totalCents),
      firstAmount: perAmount,
      lastAmount: perAmount,
    };
  }

  if (cents < installmentsCount) {
    return { totalAmount: fromCents(cents), firstAmount: 0, lastAmount: 0 };
  }

  const parts = distributeCents(
    cents,
    installmentsCount,
    remainderDistribution
  );
  return {
    totalAmount: fromCents(cents),
    firstAmount: fromCents(parts[0]),
    lastAmount: fromCents(parts[parts.length - 1]),
  };
}

export function getActiveFiltersCount(filters: {
  categoryId?: string;
  ownerId?: string;
  includeOverdue: boolean;
  sortBy: TransactionSortBy;
}): number {
  let count = 0;

  if (filters.categoryId) {
    count += 1;
  }

  if (filters.ownerId) {
    count += 1;
  }

  if (filters.includeOverdue) {
    count += 1;
  }

  if (filters.sortBy !== "overdue_first") {
    count += 1;
  }

  return count;
}
