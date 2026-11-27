import { DatabaseError, type InvoiceInstallmentItem } from "../../../database";
import {
  extractErrorMessage,
  formatInvoiceDueDate,
  formatInvoiceMonthLabel,
  getInvoiceInstallmentBadge,
  getLimitUsagePercent,
  parseDayInput,
} from "./invoiceHelpers";

function createInstallment(
  overrides: Partial<InvoiceInstallmentItem> = {}
): InvoiceInstallmentItem {
  return {
    installmentId: "inst-1",
    transactionId: "tx-1",
    name: "Mercado",
    type: "EXPENSE",
    amount: 200,
    paidAmount: 0,
    remainingAmount: 200,
    number: 1,
    installmentsCount: 1,
    dueDate: "2026-11-10",
    paidAt: null,
    status: "PENDING",
    isOverdue: false,
    categoryId: null,
    categoryName: null,
    ownerId: "owner-1",
    ownerName: "EU",
    ...overrides,
  };
}

describe("invoiceHelpers", () => {
  it("returns status badges for paid, overdue, partial and pending", () => {
    expect(
      getInvoiceInstallmentBadge(createInstallment({ status: "PAID" }))
    ).toEqual({ label: "Pago", tone: "success" });

    expect(
      getInvoiceInstallmentBadge(createInstallment({ isOverdue: true }))
    ).toEqual({ label: "Vencida", tone: "danger" });

    expect(
      getInvoiceInstallmentBadge(createInstallment({ paidAmount: 50 }))
    ).toEqual({ label: "Parcial", tone: "warning" });

    expect(getInvoiceInstallmentBadge(createInstallment())).toEqual({
      label: "Pendente",
      tone: "muted",
    });
  });

  it("calculates limit usage percentage safely", () => {
    expect(getLimitUsagePercent(0, 0)).toBe(0);
    expect(getLimitUsagePercent(0, 150)).toBe(100);
    expect(getLimitUsagePercent(-10, 50)).toBe(100);
    expect(getLimitUsagePercent(1000, -50)).toBe(0);
    expect(getLimitUsagePercent(1000, 350)).toBe(35);
    expect(getLimitUsagePercent(1000, 1500)).toBe(100);
  });

  it("parses day input for empty, valid and invalid values", () => {
    expect(parseDayInput("")).toBeNull();
    expect(parseDayInput("   ")).toBeNull();
    expect(parseDayInput("1")).toBe(1);
    expect(parseDayInput("31")).toBe(31);
    expect(Number.isNaN(parseDayInput("abc"))).toBe(true);
    expect(Number.isNaN(parseDayInput("0"))).toBe(true);
    expect(Number.isNaN(parseDayInput("32"))).toBe(true);
  });

  it("formats month label and due date", () => {
    expect(formatInvoiceMonthLabel("2026-11")).toMatch(/2026/);
    expect(formatInvoiceDueDate("2026-11-10")).toMatch(/2026/);
  });

  it("extracts database error message or returns fallback", () => {
    expect(
      extractErrorMessage(
        new DatabaseError("VALIDATION_ERROR", "Nome inválido"),
        "Fallback"
      )
    ).toBe("Nome inválido");

    expect(
      extractErrorMessage(
        new DatabaseError("VALIDATION_ERROR", "   "),
        "Fallback"
      )
    ).toBe("Fallback");

    expect(extractErrorMessage(new Error("boom"), "Fallback")).toBe("Fallback");
  });
});
