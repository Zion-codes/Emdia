import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  advanceRecurringInstallment,
  deleteTransaction,
  stopRecurrence,
  type TransactionListItem,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import { TransactionActionsModal } from "./TransactionActionsModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    advanceRecurringInstallment: jest.fn(),
    stopRecurrence: jest.fn(),
    deleteTransaction: jest.fn(),
  };
});
jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
}));

const mockAdvance = jest.mocked(advanceRecurringInstallment);
const mockStopRecurrence = jest.mocked(stopRecurrence);
const mockDeleteTransaction = jest.mocked(deleteTransaction);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);

function createItem(
  overrides: Partial<TransactionListItem> = {}
): TransactionListItem {
  return {
    installmentId: "inst-1",
    transactionId: "tx-1",
    name: "Academia",
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
    categoryId: null,
    categoryName: null,
    ownerId: "owner-1",
    ownerName: "Eu",
    invoiceId: null,
    invoiceName: null,
    groupId: null,
    recurrence: true,
    active: true,
    notes: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TransactionActionsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue({} as SQLite.SQLiteDatabase);
    mockUseMoney.mockReturnValue((value: number) => `R$ ${value.toFixed(2)}`);
  });

  it("renders empty when item is null", async () => {
    await render(
      <TransactionActionsModal
        visible
        item={null}
        onClose={jest.fn()}
        onPay={jest.fn()}
        onRevert={jest.fn()}
        onEdit={jest.fn()}
        onMutated={jest.fn()}
      />
    );

    expect(screen.queryByTestId("action-edit-button")).toBeNull();
  });

  it("blocks direct payment for projected items and allows advancing recurrence", async () => {
    const onClose = jest.fn();
    const onMutated = jest.fn();

    mockAdvance
      .mockRejectedValueOnce(new Error("Erro ao adiantar"))
      .mockResolvedValueOnce({} as never);

    await render(
      <TransactionActionsModal
        visible
        item={createItem({ isProjected: true })}
        onClose={onClose}
        onPay={jest.fn()}
        onRevert={jest.fn()}
        onEdit={jest.fn()}
        onMutated={onMutated}
      />
    );

    expect(screen.getByTestId("actions-projected-notice")).toBeTruthy();
    expect(screen.queryByTestId("action-pay-button")).toBeNull();

    await fireEvent.press(
      screen.getByTestId("action-advance-recurrence-button")
    );
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível adiantar a próxima parcela.")
      ).toBeTruthy();
    });

    await fireEvent.press(
      screen.getByTestId("action-advance-recurrence-button")
    );
    await waitFor(() => {
      expect(mockAdvance).toHaveBeenCalledWith(expect.anything(), "tx-1");
      expect(onMutated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("hides revert action when paidAmount is zero", async () => {
    await render(
      <TransactionActionsModal
        visible
        item={createItem({ paidAmount: 0, recurrence: false })}
        onClose={jest.fn()}
        onPay={jest.fn()}
        onRevert={jest.fn()}
        onEdit={jest.fn()}
        onMutated={jest.fn()}
      />
    );

    expect(screen.queryByTestId("action-revert-button")).toBeNull();
  });

  it("dispatches pay, revert and edit callbacks", async () => {
    const onPay = jest.fn();
    const onRevert = jest.fn();
    const onEdit = jest.fn();

    const item = createItem({
      type: "INCOME",
      paidAmount: 50,
      remainingAmount: 70,
      recurrence: false,
    });

    await render(
      <TransactionActionsModal
        visible
        item={item}
        onClose={jest.fn()}
        onPay={onPay}
        onRevert={onRevert}
        onEdit={onEdit}
        onMutated={jest.fn()}
      />
    );

    expect(screen.getByText("Registrar recebimento")).toBeTruthy();
    expect(screen.queryByTestId("action-stop-recurrence-button")).toBeNull();

    await fireEvent.press(screen.getByTestId("action-pay-button"));
    await fireEvent.press(screen.getByTestId("action-revert-button"));
    await fireEvent.press(screen.getByTestId("action-edit-button"));

    expect(onPay).toHaveBeenCalledWith(item);
    expect(onRevert).toHaveBeenCalledWith(item);
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it("confirms stop recurrence with error handling", async () => {
    const onClose = jest.fn();
    const onMutated = jest.fn();

    mockStopRecurrence
      .mockRejectedValueOnce(new Error("Erro ao encerrar"))
      .mockResolvedValueOnce({} as never);

    await render(
      <TransactionActionsModal
        visible
        item={createItem({ status: "PAID", paidAmount: 120 })}
        onClose={onClose}
        onPay={jest.fn()}
        onRevert={jest.fn()}
        onEdit={jest.fn()}
        onMutated={onMutated}
      />
    );

    expect(screen.queryByTestId("action-pay-button")).toBeNull();

    await fireEvent.press(screen.getByTestId("action-stop-recurrence-button"));
    await fireEvent.press(screen.getByTestId("actions-confirm-cancel-button"));
    await fireEvent.press(screen.getByTestId("action-stop-recurrence-button"));
    await fireEvent.press(screen.getByTestId("actions-confirm-execute-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível encerrar a recorrência.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("actions-confirm-execute-button"));
    await waitFor(() => {
      expect(mockStopRecurrence).toHaveBeenLastCalledWith(
        expect.anything(),
        "tx-1"
      );
      expect(onMutated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("confirms delete transaction with error handling", async () => {
    const onClose = jest.fn();
    const onMutated = jest.fn();

    mockDeleteTransaction
      .mockRejectedValueOnce(new Error("Erro ao excluir"))
      .mockResolvedValueOnce(undefined);

    await render(
      <TransactionActionsModal
        visible
        item={createItem({ status: "PAID", paidAmount: 120 })}
        onClose={onClose}
        onPay={jest.fn()}
        onRevert={jest.fn()}
        onEdit={jest.fn()}
        onMutated={onMutated}
      />
    );

    await fireEvent.press(screen.getByTestId("action-delete-button"));
    await fireEvent.press(screen.getByTestId("actions-confirm-execute-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível excluir o lançamento.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("actions-confirm-execute-button"));
    await waitFor(() => {
      expect(mockDeleteTransaction).toHaveBeenLastCalledWith(
        expect.anything(),
        "tx-1"
      );
      expect(onMutated).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
