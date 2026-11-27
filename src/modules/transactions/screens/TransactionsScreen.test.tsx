import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  type Category,
  createTransaction,
  deleteTransaction,
  type Invoice,
  listCategories,
  listInvoices,
  listOwners,
  listTransactions,
  type Owner,
  registerInstallmentPayment,
  revertInstallmentPayment,
  type TransactionListItem,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { TransactionsScreen } from "./TransactionsScreen";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    listTransactions: jest.fn(),
    listCategories: jest.fn(),
    listOwners: jest.fn(),
    listInvoices: jest.fn(),
    createTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    registerInstallmentPayment: jest.fn(),
    revertInstallmentPayment: jest.fn(),
  };
});
jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
  usePrivacy: jest.fn(),
}));

const mockListTransactions = jest.mocked(listTransactions);
const mockListCategories = jest.mocked(listCategories);
const mockListOwners = jest.mocked(listOwners);
const mockListInvoices = jest.mocked(listInvoices);
const mockCreateTransaction = jest.mocked(createTransaction);
const mockDeleteTransaction = jest.mocked(deleteTransaction);
const mockRegisterPayment = jest.mocked(registerInstallmentPayment);
const mockRevertPayment = jest.mocked(revertInstallmentPayment);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

const categories: Category[] = [
  {
    id: "cat-1",
    name: "Moradia",
    icon: "home",
    color: "#3B82F6",
    budget: null,
    transactionsCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const owners: Owner[] = [
  {
    id: "owner-1",
    name: "Eu",
    isSelf: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const invoices: Invoice[] = [
  {
    id: "inv-1",
    name: "Nubank",
    limitAmount: 5000,
    usedLimit: 0,
    availableLimit: 5000,
    monthTotal: 0,
    monthPaid: 0,
    monthPending: 0,
    color: null,
    closingDay: 10,
    dueDay: 17,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

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
    categoryId: "cat-1",
    categoryName: "Moradia",
    ownerId: "owner-1",
    ownerName: "Eu",
    invoiceId: "inv-1",
    invoiceName: "Nubank",
    groupId: null,
    recurrence: false,
    active: true,
    notes: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

async function renderScreen(): Promise<QueryClient> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  await render(
    <QueryClientProvider client={queryClient}>
      <TransactionsScreen />
    </QueryClientProvider>
  );

  return queryClient;
}

describe("TransactionsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue({} as SQLite.SQLiteDatabase);
    mockUseMoney.mockReturnValue((value: number) => `R$ ${value.toFixed(2)}`);
    mockUsePrivacy.mockReturnValue({ isHidden: false, toggle: jest.fn() });
    mockListCategories.mockResolvedValue(categories);
    mockListOwners.mockResolvedValue(owners);
    mockListInvoices.mockResolvedValue(invoices);
  });

  it("renders loading, error with retry, and empty state without filters", async () => {
    mockListTransactions
      .mockRejectedValueOnce(new Error("Falha"))
      .mockResolvedValueOnce([]);

    await renderScreen();

    expect(screen.getByTestId("transactions-loading")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("transactions-error")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("transactions-retry-button"));

    await waitFor(() => {
      expect(screen.getByTestId("transactions-empty")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("transactions-empty-add-button"));
    expect(screen.getByTestId("transaction-form-modal")).toBeTruthy();
  });

  it("renders all status badges, privacy formatting, search, month and filter chips", async () => {
    mockUseMoney.mockReturnValue(() => "R$ ••••");
    mockListTransactions.mockResolvedValue([
      createItem({
        installmentId: "i-1",
        name: "Salário",
        type: "INCOME",
        status: "PAID",
        paidAmount: 5000,
        remainingAmount: 0,
      }),
      createItem({
        installmentId: "i-2",
        name: "Luz",
        isOverdue: true,
        categoryName: null,
        invoiceName: null,
      }),
      createItem({
        installmentId: "i-3",
        name: "Parcelado",
        paidAmount: 100,
        number: 2,
        installmentsCount: 6,
      }),
      createItem({
        installmentId: "i-4",
        name: "Assinatura",
        isProjected: true,
        recurrence: true,
      }),
      createItem({ installmentId: "i-5", name: "Mercado" }),
    ]);

    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("transactions-list")).toBeTruthy();
    });

    expect(screen.getAllByText("R$ ••••").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Pago")).toBeTruthy();
    expect(screen.getByText("Vencida")).toBeTruthy();
    expect(screen.getByText("Parcial")).toBeTruthy();
    expect(screen.getByText("Projetada")).toBeTruthy();
    expect(screen.getByText("Pendente")).toBeTruthy();
    expect(screen.getByText("2/6")).toBeTruthy();
    expect(screen.getByText("Recorrente")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("prev-month-button"));
    await fireEvent.press(screen.getByTestId("next-month-button"));

    await fireEvent.changeText(
      screen.getByTestId("transactions-search-input"),
      "Luz"
    );
    await fireEvent.press(screen.getByTestId("transactions-search-clear"));

    await fireEvent.press(screen.getByTestId("type-chip-income"));
    await fireEvent.press(screen.getByTestId("type-chip-expense"));
    await fireEvent.press(screen.getByTestId("type-chip-all"));

    await fireEvent.press(screen.getByTestId("status-chip-pending"));
    await fireEvent.press(screen.getByTestId("status-chip-paid"));
    await fireEvent.press(screen.getByTestId("status-chip-all"));
  });

  it("applies and clears filters and handles empty state with active criteria", async () => {
    mockListTransactions.mockResolvedValue([]);

    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("transactions-empty")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("transactions-filters-button"));
    await fireEvent.press(screen.getByTestId("filter-category-cat-1"));
    await fireEvent.press(screen.getByTestId("filters-apply-button"));

    await waitFor(() => {
      expect(
        screen.getByTestId("transactions-empty-clear-button")
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByTestId("transactions-empty-clear-button")
    );

    await waitFor(() => {
      expect(screen.getByTestId("transactions-empty-add-button")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("transactions-filters-button"));
    await fireEvent.press(screen.getByTestId("filters-clear-button"));
  });

  it("orchestrates create, actions, payment, revert, edit and invalidates queries", async () => {
    const itemPending = createItem({
      installmentId: "inst-pending",
      transactionId: "tx-pending",
      name: "Internet",
      paidAmount: 20,
      remainingAmount: 80,
    });

    mockListTransactions.mockResolvedValue([itemPending]);
    mockCreateTransaction.mockResolvedValue({} as never);
    mockRegisterPayment.mockResolvedValue({} as never);
    mockRevertPayment.mockResolvedValue({} as never);
    mockDeleteTransaction.mockResolvedValue(undefined);

    const queryClient = await renderScreen();
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    await waitFor(() => {
      expect(screen.getByTestId("transaction-item-inst-pending")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("add-transaction-button"));
    await fireEvent.changeText(
      screen.getByTestId("tx-form-name-input"),
      "Água"
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-amount-input"),
      "90"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["transactions"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["monthly-summary"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["invoices"],
      });
    });

    await fireEvent.press(screen.getByTestId("transaction-item-inst-pending"));
    await fireEvent.press(screen.getByTestId("action-pay-button"));
    await fireEvent.press(screen.getByTestId("payment-submit-button"));

    await waitFor(() => {
      expect(mockRegisterPayment).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByTestId("transaction-item-inst-pending"));
    await fireEvent.press(screen.getByTestId("action-revert-button"));
    await fireEvent.press(screen.getByTestId("payment-confirm-revert-button"));

    await waitFor(() => {
      expect(mockRevertPayment).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByTestId("transaction-item-inst-pending"));
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("transaction-item-inst-pending"));
    await fireEvent.press(screen.getByTestId("action-edit-button"));
    expect(screen.getByTestId("transaction-form-modal")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("tx-form-cancel-button"));
  });
});
