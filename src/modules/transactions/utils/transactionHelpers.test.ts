import { type TransactionListItem } from "../../../database";
import {
  formatDueDateLabel,
  getActiveFiltersCount,
  getInstallmentPreview,
  getTransactionStatusBadge,
} from "./transactionHelpers";

function createItem(
  overrides: Partial<TransactionListItem> = {}
): TransactionListItem {
  return {
    installmentId: "inst-1",
    transactionId: "tx-1",
    name: "Aluguel",
    type: "EXPENSE",
    amount: 1200,
    paidAmount: 0,
    remainingAmount: 1200,
    number: 1,
    installmentsCount: 1,
    dueDate: "2026-11-10",
    paidAt: null,
    status: "PENDING",
    isOverdue: false,
    isProjected: false,
    categoryId: null,
    categoryName: null,
    ownerId: "owner-1",
    ownerName: "Eu",
    invoiceId: null,
    invoiceName: null,
    groupId: null,
    recurrence: false,
    active: true,
    notes: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("transactionHelpers", () => {
  it("formats due date labels", () => {
    expect(formatDueDateLabel("2026-11-05")).toBe("05/11/2026");
  });

  it("returns expected status badges for every transaction state", () => {
    expect(
      getTransactionStatusBadge(createItem({ isProjected: true }))
    ).toEqual({ label: "Projetada", tone: "accent" });

    expect(getTransactionStatusBadge(createItem({ status: "PAID" }))).toEqual({
      label: "Pago",
      tone: "success",
    });

    expect(getTransactionStatusBadge(createItem({ isOverdue: true }))).toEqual({
      label: "Vencida",
      tone: "danger",
    });

    expect(getTransactionStatusBadge(createItem({ paidAmount: 200 }))).toEqual({
      label: "Parcial",
      tone: "warning",
    });

    expect(getTransactionStatusBadge(createItem())).toEqual({
      label: "Pendente",
      tone: "muted",
    });
  });

  it("calculates installment previews for total, per_installment and invalid values", () => {
    expect(
      getInstallmentPreview({
        amount: 0,
        installmentsCount: 3,
        amountMode: "total",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 0, firstAmount: 0, lastAmount: 0 });

    expect(
      getInstallmentPreview({
        amount: 100,
        installmentsCount: 3,
        amountMode: "total",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 100, firstAmount: 33.33, lastAmount: 33.34 });

    expect(
      getInstallmentPreview({
        amount: 100,
        installmentsCount: 3,
        amountMode: "total",
        remainderDistribution: "first",
      })
    ).toEqual({ totalAmount: 100, firstAmount: 33.34, lastAmount: 33.33 });

    expect(
      getInstallmentPreview({
        amount: 0.05,
        installmentsCount: 12,
        amountMode: "total",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 0.05, firstAmount: 0, lastAmount: 0 });

    expect(
      getInstallmentPreview({
        amount: 0.001,
        installmentsCount: 2,
        amountMode: "total",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 0, firstAmount: 0, lastAmount: 0 });

    expect(
      getInstallmentPreview({
        amount: Number.MAX_SAFE_INTEGER,
        installmentsCount: 2,
        amountMode: "total",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 0, firstAmount: 0, lastAmount: 0 });

    expect(
      getInstallmentPreview({
        amount: Math.floor(Number.MAX_SAFE_INTEGER / 100),
        installmentsCount: 2,
        amountMode: "per_installment",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 0, firstAmount: 0, lastAmount: 0 });

    expect(
      getInstallmentPreview({
        amount: 50,
        installmentsCount: 4,
        amountMode: "per_installment",
        remainderDistribution: "last",
      })
    ).toEqual({ totalAmount: 200, firstAmount: 50, lastAmount: 50 });
  });

  it("counts active filters excluding defaults", () => {
    expect(
      getActiveFiltersCount({
        includeOverdue: false,
        sortBy: "overdue_first",
      })
    ).toBe(0);

    expect(
      getActiveFiltersCount({
        categoryId: "cat-1",
        ownerId: "owner-1",
        includeOverdue: true,
        sortBy: "name",
      })
    ).toBe(4);
  });
});
