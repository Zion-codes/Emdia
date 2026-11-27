import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  type Investment,
  createInvestment,
  deleteInvestment,
  updateInvestment,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { InvestmentFormModal } from "./InvestmentFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createInvestment: jest.fn(),
    updateInvestment: jest.fn(),
    deleteInvestment: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  usePrivacy: jest.fn(),
}));

const mockCreateInvestment = jest.mocked(createInvestment);
const mockUpdateInvestment = jest.mocked(updateInvestment);
const mockDeleteInvestment = jest.mocked(deleteInvestment);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createMockInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "inv-1",
    name: "Tesouro Selic",
    type: "Renda fixa",
    institution: "XP",
    currentBalance: 5000,
    totalContributed: 4000,
    contributionsCount: 2,
    notes: "Reserva",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("InvestmentFormModal", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: jest.fn(),
    });
  });

  it("renders no content when not visible", async () => {
    await render(
      <InvestmentFormModal
        visible={false}
        investment={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("investment-name-input")).toBeNull();
  });

  it("validates and creates an investment with optional empty fields", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockCreateInvestment.mockResolvedValue(createMockInvestment());

    await render(
      <InvestmentFormModal
        visible
        investment={null}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("investment-submit-button"));
    expect(screen.getByTestId("investment-form-error").props.children).toBe(
      "Informe o nome do investimento."
    );

    await fireEvent.changeText(
      screen.getByTestId("investment-name-input"),
      "Tesouro Selic"
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-balance-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));
    expect(screen.getByTestId("investment-form-error").props.children).toBe(
      "Informe um saldo atual válido."
    );

    await fireEvent.changeText(
      screen.getByTestId("investment-balance-input"),
      ""
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(mockCreateInvestment).toHaveBeenCalledWith(fakeDb, {
        name: "Tesouro Selic",
        type: null,
        institution: null,
        currentBalance: undefined,
        notes: null,
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("creates an investment with all fields and zero balance", async () => {
    mockCreateInvestment.mockResolvedValue(createMockInvestment());

    await render(
      <InvestmentFormModal
        visible
        investment={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("investment-name-input"),
      "  CDB  "
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-type-input"),
      " Renda fixa "
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-institution-input"),
      " Nubank "
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-balance-input"),
      "0"
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-notes-input"),
      " Objetivo "
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(mockCreateInvestment).toHaveBeenCalledWith(fakeDb, {
        name: "CDB",
        type: "Renda fixa",
        institution: "Nubank",
        currentBalance: 0,
        notes: "Objetivo",
      });
    });
  });

  it("handles create error", async () => {
    mockCreateInvestment.mockRejectedValue(new Error("db error"));

    await render(
      <InvestmentFormModal
        visible
        investment={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("investment-name-input"),
      "Tesouro"
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("investment-form-error").props.children).toBe(
        "Não foi possível salvar o investimento."
      );
    });
  });

  it("updates an existing investment preserving balance when emptied", async () => {
    const investment = createMockInvestment();
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateInvestment.mockResolvedValue(investment);

    await render(
      <InvestmentFormModal
        visible
        investment={investment}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("investment-name-input").props.value).toBe(
      "Tesouro Selic"
    );
    expect(screen.getByTestId("investment-balance-input").props.value).toBe(
      "5000,00"
    );

    await fireEvent.changeText(
      screen.getByTestId("investment-name-input"),
      "Tesouro Selic 2029"
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-balance-input"),
      ""
    );
    await fireEvent.changeText(screen.getByTestId("investment-type-input"), "");
    await fireEvent.changeText(
      screen.getByTestId("investment-institution-input"),
      ""
    );
    await fireEvent.changeText(
      screen.getByTestId("investment-notes-input"),
      ""
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(mockUpdateInvestment).toHaveBeenCalledWith(fakeDb, "inv-1", {
        name: "Tesouro Selic 2029",
        type: null,
        institution: null,
        currentBalance: undefined,
        notes: null,
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("hides and preserves the balance in privacy mode when left empty", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const investment = createMockInvestment();
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateInvestment.mockResolvedValue(investment);

    await render(
      <InvestmentFormModal
        visible
        investment={investment}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("investment-balance-input").props.value).toBe("");

    await fireEvent.changeText(
      screen.getByTestId("investment-name-input"),
      "Tesouro Selic 2031"
    );
    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(mockUpdateInvestment).toHaveBeenCalledWith(fakeDb, "inv-1", {
        name: "Tesouro Selic 2031",
        type: "Renda fixa",
        institution: "XP",
        currentBalance: undefined,
        notes: "Reserva",
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles update error", async () => {
    const investment = createMockInvestment();
    mockUpdateInvestment.mockRejectedValue(new Error("db error"));

    await render(
      <InvestmentFormModal
        visible
        investment={investment}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("investment-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("investment-form-error").props.children).toBe(
        "Não foi possível salvar o investimento."
      );
    });
  });

  it("confirms and executes deletion and handles delete error", async () => {
    const investment = createMockInvestment();
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockDeleteInvestment
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);

    await render(
      <InvestmentFormModal
        visible
        investment={investment}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("investment-delete-button"));
    expect(screen.getByTestId("investment-delete-confirm-box")).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("investment-cancel-delete-button")
    );
    expect(screen.queryByTestId("investment-delete-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("investment-delete-button"));
    await fireEvent.press(
      screen.getByTestId("investment-confirm-delete-button")
    );

    await waitFor(() => {
      expect(screen.getByTestId("investment-form-error").props.children).toBe(
        "Não foi possível excluir o investimento."
      );
    });

    await fireEvent.press(
      screen.getByTestId("investment-confirm-delete-button")
    );

    await waitFor(() => {
      expect(mockDeleteInvestment).toHaveBeenCalledWith(fakeDb, "inv-1");
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
