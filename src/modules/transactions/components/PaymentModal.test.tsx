import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  registerInstallmentPayment,
  revertInstallmentPayment,
  settleInstallment,
  type TransactionListItem,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { PaymentModal } from "./PaymentModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    registerInstallmentPayment: jest.fn(),
    settleInstallment: jest.fn(),
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

const mockRegisterPayment = jest.mocked(registerInstallmentPayment);
const mockSettleInstallment = jest.mocked(settleInstallment);
const mockRevertPayment = jest.mocked(revertInstallmentPayment);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createItem(
  overrides: Partial<TransactionListItem> = {}
): TransactionListItem {
  return {
    installmentId: "inst-1",
    transactionId: "tx-1",
    name: "Aluguel",
    type: "EXPENSE",
    amount: 1000,
    paidAmount: 0,
    remainingAmount: 1000,
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

describe("PaymentModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue({} as SQLite.SQLiteDatabase);
    mockUseMoney.mockReturnValue((value: number) => `R$ ${value.toFixed(2)}`);
    mockUsePrivacy.mockReturnValue({ isHidden: false, toggle: jest.fn() });
  });

  it("hides initial amount input when privacy mode is active", async () => {
    mockUsePrivacy.mockReturnValue({ isHidden: true, toggle: jest.fn() });

    await render(
      <PaymentModal
        visible
        item={createItem()}
        mode="pay"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("payment-amount-input").props.value).toBe("");
  });

  it("renders empty when item is null", async () => {
    await render(
      <PaymentModal
        visible
        item={null}
        mode="pay"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("payment-amount-input")).toBeNull();
  });

  it("validates payment amount and submits partial payment", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    mockRegisterPayment
      .mockRejectedValueOnce(new Error("Erro no pagamento"))
      .mockResolvedValueOnce({} as never);

    await render(
      <PaymentModal
        visible
        item={createItem({ type: "INCOME" })}
        mode="pay"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("payment-amount-input"),
      "0,001"
    );
    await fireEvent.press(screen.getByTestId("payment-submit-button"));
    expect(
      screen.getByText("Informe um valor válido maior que zero.")
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("payment-amount-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("payment-submit-button"));
    expect(
      screen.getByText("Informe um valor válido maior que zero.")
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("payment-amount-input"),
      "1500"
    );
    await fireEvent.press(screen.getByTestId("payment-submit-button"));
    expect(
      screen.getByText("O valor informado excede o saldo restante.")
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("payment-amount-input"),
      "400"
    );
    await fireEvent.press(screen.getByTestId("payment-submit-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível registrar o pagamento.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("payment-submit-button"));

    await waitFor(() => {
      expect(mockRegisterPayment).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          installmentId: "inst-1",
          amount: 400,
        })
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("handles confirmed settlement and error state", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    mockSettleInstallment
      .mockRejectedValueOnce(new Error("Falha ao quitar"))
      .mockResolvedValueOnce({} as never);

    await render(
      <PaymentModal
        visible
        item={createItem()}
        mode="pay"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("payment-settle-button"));
    expect(screen.getByTestId("payment-settle-confirm-box")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("payment-cancel-settle-button"));
    expect(screen.queryByTestId("payment-settle-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("payment-settle-button"));
    await fireEvent.press(screen.getByTestId("payment-confirm-settle-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível quitar a parcela.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("payment-confirm-settle-button"));

    await waitFor(() => {
      expect(mockSettleInstallment).toHaveBeenLastCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ confirmed: true })
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("handles confirmed revert and error state", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    mockRevertPayment
      .mockRejectedValueOnce(new Error("Falha ao estornar"))
      .mockResolvedValueOnce({} as never);

    await render(
      <PaymentModal
        visible
        item={createItem({
          status: "PAID",
          paidAmount: 1000,
          remainingAmount: 0,
        })}
        mode="revert"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("payment-confirm-revert-button"));
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível estornar o pagamento.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("payment-confirm-revert-button"));

    await waitFor(() => {
      expect(mockRevertPayment).toHaveBeenLastCalledWith(
        expect.anything(),
        "inst-1",
        { confirmed: true }
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
