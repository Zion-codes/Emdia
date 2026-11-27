import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  createInvoice,
  DatabaseError,
  deleteInvoice,
  type Invoice,
  updateInvoice,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { avatarPalette } from "../../../theme/colors";
import { InvoiceFormModal } from "./InvoiceFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createInvoice: jest.fn(),
    updateInvoice: jest.fn(),
    deleteInvoice: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  usePrivacy: jest.fn(),
}));

const mockCreateInvoice = jest.mocked(createInvoice);
const mockUpdateInvoice = jest.mocked(updateInvoice);
const mockDeleteInvoice = jest.mocked(deleteInvoice);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createMockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    name: "Nubank",
    limitAmount: 5000,
    usedLimit: 1200,
    availableLimit: 3800,
    monthTotal: 600,
    monthPaid: 0,
    monthPending: 600,
    color: avatarPalette[0],
    dueDay: 10,
    closingDay: 3,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("InvoiceFormModal", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: jest.fn(),
    });
  });

  it("renders null content when not visible", async () => {
    await render(
      <InvoiceFormModal
        visible={false}
        invoice={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("invoice-name-input")).toBeNull();
  });

  it("validates fields and creates a new invoice with color and closing day", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockCreateInvoice.mockResolvedValue(createMockInvoice({ id: "inv-new" }));

    await render(
      <InvoiceFormModal
        visible
        invoice={null}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("invoice-submit-button"));
    expect(screen.getByTestId("invoice-form-error").props.children).toBe(
      "Informe o nome do cartão."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-name-input"),
      "Inter"
    );
    await fireEvent.changeText(
      screen.getByTestId("invoice-limit-input"),
      "-10"
    );
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));
    expect(screen.getByTestId("invoice-form-error").props.children).toBe(
      "Informe um limite válido maior ou igual a zero."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-limit-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));
    expect(screen.getByTestId("invoice-form-error").props.children).toBe(
      "Informe um limite válido maior ou igual a zero."
    );

    await fireEvent.changeText(screen.getByTestId("invoice-limit-input"), "");
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));
    expect(screen.getByTestId("invoice-form-error").props.children).toBe(
      "Informe um dia de vencimento entre 1 e 31."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-due-day-input"),
      "15"
    );
    await fireEvent.changeText(
      screen.getByTestId("invoice-closing-day-input"),
      "35"
    );
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));
    expect(screen.getByTestId("invoice-form-error").props.children).toBe(
      "Informe um dia de fechamento entre 1 e 31."
    );

    await fireEvent.changeText(
      screen.getByTestId("invoice-limit-input"),
      "2500,50"
    );
    await fireEvent.changeText(
      screen.getByTestId("invoice-closing-day-input"),
      "8"
    );
    await fireEvent.press(screen.getByTestId("invoice-color-1"));
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));

    await waitFor(() => {
      expect(mockCreateInvoice).toHaveBeenCalledWith(fakeDb, {
        name: "Inter",
        limitAmount: 2500.5,
        dueDay: 15,
        closingDay: 8,
        color: avatarPalette[1],
      });
    });
    expect(onSuccess).toHaveBeenCalledWith("inv-new");
    expect(onClose).toHaveBeenCalled();
  });

  it("handles create error and clearing color", async () => {
    mockCreateInvoice.mockRejectedValue(
      new DatabaseError("VALIDATION_ERROR", "Erro ao criar cartão")
    );

    await render(
      <InvoiceFormModal
        visible
        invoice={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(screen.getByTestId("invoice-name-input"), "C6");
    await fireEvent.changeText(
      screen.getByTestId("invoice-due-day-input"),
      "20"
    );
    await fireEvent.press(screen.getByTestId("invoice-color-0"));
    await fireEvent.press(screen.getByTestId("invoice-color-none"));
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("invoice-form-error").props.children).toBe(
        "Erro ao criar cartão"
      );
    });
  });

  it("updates existing invoice preserving limit when privacy mode is active", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const invoice = createMockInvoice({ closingDay: null, color: null });
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateInvoice.mockResolvedValue(invoice);

    await render(
      <InvoiceFormModal
        visible
        invoice={invoice}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("invoice-limit-input").props.value).toBe("");
    await fireEvent.changeText(
      screen.getByTestId("invoice-name-input"),
      "Nubank Ultra"
    );
    await fireEvent.press(screen.getByTestId("invoice-submit-button"));

    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalledWith(fakeDb, "inv-1", {
        name: "Nubank Ultra",
        limitAmount: undefined,
        dueDay: 10,
        closingDay: null,
        color: null,
      });
    });
    expect(onSuccess).toHaveBeenCalledWith("inv-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("confirms and executes invoice deletion and handles delete error", async () => {
    const invoice = createMockInvoice();
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockDeleteInvoice
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);

    await render(
      <InvoiceFormModal
        visible
        invoice={invoice}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("invoice-delete-button"));
    expect(screen.getByTestId("invoice-delete-confirm-box")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("invoice-cancel-delete-button"));
    expect(screen.queryByTestId("invoice-delete-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("invoice-delete-button"));
    await fireEvent.press(screen.getByTestId("invoice-confirm-delete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("invoice-form-error").props.children).toBe(
        "Não foi possível excluir o cartão."
      );
    });

    await fireEvent.press(screen.getByTestId("invoice-confirm-delete-button"));

    await waitFor(() => {
      expect(mockDeleteInvoice).toHaveBeenCalledWith(fakeDb, "inv-1");
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
