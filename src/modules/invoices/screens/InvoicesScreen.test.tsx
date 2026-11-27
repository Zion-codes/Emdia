import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { type ReactElement } from "react";
import {
  createInvoice,
  deleteInvoice,
  getInvoiceMonthSummary,
  type Invoice,
  type InvoiceMonthSummary,
  listInvoices,
  payInvoice,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { InvoicesScreen } from "./InvoicesScreen";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    listInvoices: jest.fn(),
    getInvoiceMonthSummary: jest.fn(),
    createInvoice: jest.fn(),
    deleteInvoice: jest.fn(),
    payInvoice: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
  usePrivacy: jest.fn(),
}));

const mockListInvoices = jest.mocked(listInvoices);
const mockGetInvoiceMonthSummary = jest.mocked(getInvoiceMonthSummary);
const mockCreateInvoice = jest.mocked(createInvoice);
const mockDeleteInvoice = jest.mocked(deleteInvoice);
const mockPayInvoice = jest.mocked(payInvoice);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

function renderWithQuery(ui: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    name: "Nubank",
    limitAmount: 5000,
    usedLimit: 1200,
    availableLimit: 3800,
    monthTotal: 600,
    monthPaid: 100,
    monthPending: 500,
    color: "#3B82F6",
    dueDay: 10,
    closingDay: 3,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function createMockSummary(
  invoice: Invoice,
  overrides: Partial<InvoiceMonthSummary> = {}
): InvoiceMonthSummary {
  return {
    invoice,
    month: "2026-11",
    totalAmount: 600,
    paidAmount: 100,
    pendingAmount: 500,
    overdueCount: 1,
    installments: [
      {
        installmentId: "inst-1",
        transactionId: "tx-1",
        name: "Notebook",
        type: "EXPENSE",
        amount: 400,
        paidAmount: 100,
        remainingAmount: 300,
        number: 2,
        installmentsCount: 5,
        dueDate: "2026-11-10",
        paidAt: null,
        status: "PENDING",
        isOverdue: false,
        categoryId: "cat-1",
        categoryName: "Eletrônicos",
        ownerId: "owner-1",
        ownerName: "EU",
      },
      {
        installmentId: "inst-2",
        transactionId: "tx-2",
        name: "Café",
        type: "EXPENSE",
        amount: 200,
        paidAmount: 200,
        remainingAmount: 0,
        number: 1,
        installmentsCount: 1,
        dueDate: "2026-11-05",
        paidAt: "2026-11-05",
        status: "PAID",
        isOverdue: false,
        categoryId: null,
        categoryName: null,
        ownerId: "owner-1",
        ownerName: "",
      },
    ],
    ...overrides,
  };
}

describe("InvoicesScreen", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
    mockUseMoney.mockReturnValue(
      (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`
    );
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: jest.fn(),
    });
  });

  it("shows loading, error retry, and empty state with add card CTA", async () => {
    let resolvePending!: (value: Invoice[]) => void;
    mockListInvoices.mockImplementationOnce(
      () =>
        new Promise<Invoice[]>((resolve) => {
          resolvePending = resolve;
        })
    );

    await renderWithQuery(<InvoicesScreen />);
    expect(screen.getByTestId("invoices-loading")).toBeTruthy();

    resolvePending([]);
    await waitFor(() => {
      expect(screen.getByTestId("invoices-empty")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("invoices-empty-add-button"));
    expect(screen.getByTestId("invoice-name-input")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    mockListInvoices.mockRejectedValueOnce(new Error("db error"));
    await fireEvent.press(screen.getByTestId("invoices-prev-month"));

    await waitFor(() => {
      expect(screen.getByTestId("invoices-error")).toBeTruthy();
    });

    mockListInvoices.mockResolvedValueOnce([]);
    await fireEvent.press(screen.getByTestId("invoices-retry-button"));

    await waitFor(() => {
      expect(screen.getByTestId("invoices-empty")).toBeTruthy();
    });
  });

  it("renders cards, switches selection, handles summary error, over-limit, and payments", async () => {
    const inv1 = createMockInvoice({ id: "inv-1", name: "Nubank" });
    const inv2 = createMockInvoice({
      id: "inv-2",
      name: "Inter",
      limitAmount: 1000,
      usedLimit: 1200,
      availableLimit: -200,
      color: null,
      closingDay: null,
    });

    mockListInvoices.mockResolvedValue([inv1, inv2]);
    mockGetInvoiceMonthSummary
      .mockResolvedValueOnce(createMockSummary(inv1))
      .mockRejectedValueOnce(new Error("summary fail"))
      .mockResolvedValueOnce(
        createMockSummary(inv2, {
          pendingAmount: 0,
          overdueCount: 2,
          installments: [],
        })
      );

    await renderWithQuery(<InvoicesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-card-inv-1")).toBeTruthy();
      expect(screen.getByTestId("invoice-installment-inst-1")).toBeTruthy();
      expect(screen.getByTestId("invoice-installment-inst-2")).toBeTruthy();
    });

    expect(screen.getByTestId("invoice-overdue-banner")).toBeTruthy();
    expect(screen.getByTestId("selected-invoice-color")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("invoice-card-inv-2"));

    await waitFor(() => {
      expect(screen.getByTestId("invoice-summary-error")).toBeTruthy();
    });

    expect(screen.getByTestId("invoice-over-limit")).toBeTruthy();
    expect(screen.queryByTestId("selected-invoice-color")).toBeNull();

    await fireEvent.press(screen.getByTestId("invoice-summary-retry-button"));

    await waitFor(() => {
      expect(screen.getByTestId("invoice-installments-empty")).toBeTruthy();
    });
    expect(screen.queryByTestId("invoice-pay-button")).toBeNull();

    await fireEvent.press(screen.getByTestId("invoice-edit-button"));
    expect(screen.getByTestId("invoice-name-input").props.value).toBe("Inter");
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
  });

  it("opens add modal from header, creates card, changes month and pays invoice", async () => {
    const inv1 = createMockInvoice({ id: "inv-1", name: "Nubank" });
    mockListInvoices.mockResolvedValue([inv1]);
    mockGetInvoiceMonthSummary.mockResolvedValue(
      createMockSummary(inv1, { overdueCount: 0 })
    );
    mockCreateInvoice.mockResolvedValue(
      createMockInvoice({ id: "inv-created", name: "XP" })
    );
    mockPayInvoice.mockResolvedValue({
      invoiceId: "inv-1",
      month: "2026-11",
      paidAmount: 500,
      remainingMonthAmount: 0,
      settledCount: 1,
      partiallyPaidCount: 0,
      updatedInstallments: [],
    });

    await renderWithQuery(<InvoicesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-pay-button")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("invoice-pay-button"));
    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));

    await waitFor(() => {
      expect(mockPayInvoice).toHaveBeenCalled();
    });

    await fireEvent.press(screen.getByTestId("invoices-next-month"));
    await fireEvent.press(screen.getByTestId("invoices-add-button"));

    await fireEvent.changeText(screen.getByTestId("invoice-name-input"), "XP");
    await fireEvent.changeText(
      screen.getByTestId("invoice-due-day-input"),
      "12"
    );
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));

    await waitFor(() => {
      expect(mockCreateInvoice).toHaveBeenCalled();
    });
  });

  it("deletes a card from the edit modal without changing selection", async () => {
    const inv1 = createMockInvoice({ id: "inv-1", name: "Nubank" });
    const inv2 = createMockInvoice({ id: "inv-2", name: "Inter" });
    mockListInvoices.mockResolvedValue([inv1, inv2]);
    mockGetInvoiceMonthSummary.mockResolvedValue(createMockSummary(inv1));
    mockDeleteInvoice.mockResolvedValue(undefined);

    await renderWithQuery(<InvoicesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("invoice-card-inv-1")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("invoice-edit-button"));
    expect(screen.getByTestId("invoice-name-input").props.value).toBe("Nubank");

    await fireEvent.press(screen.getByTestId("invoice-delete-button"));
    await fireEvent.press(screen.getByTestId("invoice-confirm-delete-button"));

    await waitFor(() => {
      expect(mockDeleteInvoice).toHaveBeenCalledWith(fakeDb, "inv-1");
    });
  });
});
