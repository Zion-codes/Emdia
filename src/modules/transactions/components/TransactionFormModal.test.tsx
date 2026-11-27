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
  DatabaseError,
  type Invoice,
  type Owner,
  type TransactionListItem,
  updateTransaction,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import { TransactionFormModal } from "./TransactionFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createTransaction: jest.fn(),
    updateTransaction: jest.fn(),
  };
});
jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
}));

const mockCreateTransaction = jest.mocked(createTransaction);
const mockUpdateTransaction = jest.mocked(updateTransaction);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);

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
  {
    id: "owner-2",
    name: "Maria",
    isSelf: false,
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

function createEditingItem(
  overrides: Partial<TransactionListItem> = {}
): TransactionListItem {
  return {
    installmentId: "inst-1",
    transactionId: "tx-1",
    name: "Internet",
    type: "EXPENSE",
    amount: 120,
    paidAmount: 0,
    remainingAmount: 120,
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
    recurrence: true,
    active: true,
    notes: "Fibra",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TransactionFormModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue({} as SQLite.SQLiteDatabase);
    mockUseMoney.mockReturnValue((value: number) => `R$ ${value.toFixed(2)}`);
  });

  it("validates required fields and invalid numbers", async () => {
    await render(
      <TransactionFormModal
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        editingItem={null}
        categories={categories}
        owners={[]}
        invoices={[]}
      />
    );

    expect(screen.queryByTestId("tx-form-invoice-section")).toBeNull();

    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    expect(screen.getByText("Informe o nome do lançamento.")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("tx-form-name-input"),
      "Aluguel"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    expect(screen.getByText("Selecione um responsável.")).toBeTruthy();
  });

  it("validates amount and installments and enforces mutual exclusion with recurrence", async () => {
    await render(
      <TransactionFormModal
        visible
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        editingItem={null}
        categories={categories}
        owners={owners}
        invoices={invoices}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("tx-form-name-input"),
      "Notebook"
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-amount-input"),
      "0,001"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    expect(
      screen.getByText("Informe um valor válido maior que zero.")
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("tx-form-amount-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    expect(
      screen.getByText("Informe um valor válido maior que zero.")
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("tx-form-amount-input"),
      "1000"
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-installments-input"),
      ""
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-installments-input"),
      "0"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    expect(screen.getByText("Informe entre 1 e 360 parcelas.")).toBeTruthy();

    await fireEvent(
      screen.getByTestId("tx-form-recurrence-switch"),
      "valueChange",
      true
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-installments-input"),
      "3"
    );
    expect(screen.getByTestId("tx-form-installment-options")).toBeTruthy();
    expect(
      screen.getByText("Indisponível para lançamentos parcelados.")
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId("tx-form-remainder-first"));
    await fireEvent.press(screen.getByTestId("tx-form-remainder-last"));
    await fireEvent.press(screen.getByTestId("tx-form-amount-mode-per"));
    await fireEvent.press(screen.getByTestId("tx-form-amount-mode-total"));

    mockCreateTransaction.mockResolvedValueOnce({} as never);
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          installmentsCount: 3,
          recurrence: false,
        })
      );
    });
  });

  it("creates transaction and handles duplicate conflict confirmation", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    mockCreateTransaction
      .mockRejectedValueOnce(
        new DatabaseError("CONFLICT", "Lançamento duplicado detectado.")
      )
      .mockResolvedValueOnce({} as never);

    await render(
      <TransactionFormModal
        visible
        onClose={onClose}
        onSuccess={onSuccess}
        editingItem={null}
        categories={categories}
        owners={owners}
        invoices={invoices}
      />
    );

    await fireEvent.press(screen.getByTestId("tx-form-type-income"));
    await fireEvent.press(screen.getByTestId("tx-form-type-expense"));
    await fireEvent.changeText(
      screen.getByTestId("tx-form-name-input"),
      "Mercado"
    );
    await fireEvent.changeText(
      screen.getByTestId("tx-form-amount-input"),
      "250,50"
    );
    await fireEvent.press(screen.getByTestId("tx-form-owner-owner-2"));
    await fireEvent.press(screen.getByTestId("tx-form-category-cat-1"));
    await fireEvent.press(screen.getByTestId("tx-form-category-none"));
    await fireEvent.press(screen.getByTestId("tx-form-invoice-inv-1"));
    await fireEvent.press(screen.getByTestId("tx-form-invoice-none"));
    await fireEvent.changeText(
      screen.getByTestId("tx-form-notes-input"),
      "Compra mensal"
    );

    await fireEvent.press(screen.getByTestId("tx-form-save-button"));

    await waitFor(() => {
      expect(
        screen.getByTestId("tx-form-confirm-duplicate-button")
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByTestId("tx-form-confirm-duplicate-button")
    );

    await waitFor(() => {
      expect(mockCreateTransaction).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: "Mercado",
          type: "EXPENSE",
          amount: 250.5,
          ownerId: "owner-2",
          categoryId: null,
          invoiceId: null,
          notes: "Compra mensal",
          allowDuplicate: true,
        })
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("edits transaction metadata and displays generic error on failure", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    mockUpdateTransaction
      .mockRejectedValueOnce(new Error("Falha ao atualizar"))
      .mockResolvedValueOnce({} as never);

    const { rerender } = await render(
      <TransactionFormModal
        visible={false}
        onClose={onClose}
        onSuccess={onSuccess}
        editingItem={null}
        categories={categories}
        owners={owners}
        invoices={invoices}
      />
    );

    await rerender(
      <TransactionFormModal
        visible
        onClose={onClose}
        onSuccess={onSuccess}
        editingItem={createEditingItem()}
        categories={categories}
        owners={owners}
        invoices={invoices}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("tx-form-name-input"),
      "Internet Fibra"
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível salvar o lançamento.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("tx-form-save-button"));

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        expect.anything(),
        "tx-1",
        expect.objectContaining({
          name: "Internet Fibra",
          type: "EXPENSE",
          categoryId: "cat-1",
          ownerId: "owner-1",
          invoiceId: "inv-1",
          recurrence: true,
          notes: "Fibra",
        })
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    await rerender(
      <TransactionFormModal
        visible
        onClose={onClose}
        onSuccess={onSuccess}
        editingItem={createEditingItem({
          installmentsCount: 3,
          recurrence: false,
        })}
        categories={categories}
        owners={owners}
        invoices={invoices}
      />
    );
    await fireEvent.press(screen.getByTestId("tx-form-save-button"));
    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenLastCalledWith(
        expect.anything(),
        "tx-1",
        expect.objectContaining({
          recurrence: false,
        })
      );
    });
  });
});
