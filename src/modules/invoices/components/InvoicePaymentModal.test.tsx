import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { DatabaseError, type Invoice, payInvoice } from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { InvoicePaymentModal } from "./InvoicePaymentModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
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

const mockPayInvoice = jest.mocked(payInvoice);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createMockInvoice(): Invoice {
  return {
    id: "inv-1",
    name: "Nubank",
    limitAmount: 5000,
    usedLimit: 1000,
    availableLimit: 4000,
    monthTotal: 800,
    monthPaid: 0,
    monthPending: 800,
    color: "#3B82F6",
    dueDay: 10,
    closingDay: 3,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

describe("InvoicePaymentModal", () => {
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

  it("renders nothing inside when invoice is null or hidden", async () => {
    await render(
      <InvoicePaymentModal
        visible={false}
        invoice={null}
        month="2026-11"
        pendingAmount={800}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("invoice-payment-submit-button")).toBeNull();
  });

  it("submits full invoice payment", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockPayInvoice.mockResolvedValue({
      invoiceId: "inv-1",
      month: "2026-11",
      paidAmount: 800,
      remainingMonthAmount: 0,
      settledCount: 2,
      partiallyPaidCount: 0,
      updatedInstallments: [],
    });

    await render(
      <InvoicePaymentModal
        visible
        invoice={createMockInvoice()}
        month="2026-11"
        pendingAmount={800}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));

    await waitFor(() => {
      expect(mockPayInvoice).toHaveBeenCalledWith(fakeDb, {
        invoiceId: "inv-1",
        month: "2026-11",
        amount: undefined,
        paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("validates partial payment and submits partial amount", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockPayInvoice.mockResolvedValue({
      invoiceId: "inv-1",
      month: "2026-11",
      paidAmount: 300,
      remainingMonthAmount: 500,
      settledCount: 1,
      partiallyPaidCount: 1,
      updatedInstallments: [],
    });

    await render(
      <InvoicePaymentModal
        visible
        invoice={createMockInvoice()}
        month="2026-11"
        pendingAmount={800}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("invoice-payment-mode-partial"));
    expect(screen.getByTestId("invoice-payment-amount-input").props.value).toBe(
      ""
    );

    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));
    expect(screen.getByTestId("invoice-payment-error").props.children).toBe(
      "Informe um valor válido maior que zero."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-payment-amount-input"),
      "900"
    );
    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));
    expect(screen.getByTestId("invoice-payment-error").props.children).toBe(
      "O valor informado excede o saldo pendente da fatura."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-payment-amount-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));
    expect(screen.getByTestId("invoice-payment-error").props.children).toBe(
      "Informe um valor válido maior que zero."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-payment-amount-input"),
      "300"
    );
    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));

    await waitFor(() => {
      expect(mockPayInvoice).toHaveBeenCalledWith(fakeDb, {
        invoiceId: "inv-1",
        month: "2026-11",
        amount: 300,
        paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("switches back to full mode and displays API error", async () => {
    mockPayInvoice.mockRejectedValue(
      new DatabaseError("CONFLICT", "Fatura já quitada")
    );

    await render(
      <InvoicePaymentModal
        visible
        invoice={createMockInvoice()}
        month="2026-11"
        pendingAmount={800}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("invoice-payment-mode-partial"));
    await fireEvent.press(screen.getByTestId("invoice-payment-mode-full"));
    await fireEvent.press(screen.getByTestId("invoice-payment-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("invoice-payment-error").props.children).toBe(
        "Fatura já quitada"
      );
    });
  });
});
