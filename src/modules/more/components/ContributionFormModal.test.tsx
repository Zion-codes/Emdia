import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  type Investment,
  type InvestmentContribution,
  createContribution,
  deleteContribution,
  updateContribution,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { ContributionFormModal } from "./ContributionFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createContribution: jest.fn(),
    updateContribution: jest.fn(),
    deleteContribution: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
  usePrivacy: jest.fn(),
}));

const mockCreateContribution = jest.mocked(createContribution);
const mockUpdateContribution = jest.mocked(updateContribution);
const mockDeleteContribution = jest.mocked(deleteContribution);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createMockInvestment(): Investment {
  return {
    id: "inv-1",
    name: "Tesouro Selic",
    type: "Renda fixa",
    institution: "XP",
    currentBalance: 5000,
    totalContributed: 4000,
    contributionsCount: 2,
    notes: null,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

function createMockContribution(
  overrides: Partial<InvestmentContribution> = {}
): InvestmentContribution {
  return {
    id: "contrib-1",
    investmentId: "inv-1",
    amount: 500,
    contributedAt: "2026-11-10",
    notes: "Aporte mensal",
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-10T00:00:00Z",
    ...overrides,
  };
}

describe("ContributionFormModal", () => {
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

  it("renders no content when not visible or without investment", async () => {
    await render(
      <ContributionFormModal
        visible={false}
        investment={createMockInvestment()}
        contributions={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(screen.queryByTestId("contribution-amount-input")).toBeNull();

    await render(
      <ContributionFormModal
        visible
        investment={null}
        contributions={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(screen.queryByTestId("contribution-amount-input")).toBeNull();
  });

  it("validates and creates a contribution without notes", async () => {
    const onSuccess = jest.fn();
    mockCreateContribution.mockResolvedValue(
      createMockContribution({ notes: null })
    );

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[]}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText("Aportes de Tesouro Selic")).toBeTruthy();
    expect(screen.getByTestId("contributions-empty")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("contribution-submit-button"));
    expect(screen.getByTestId("contribution-form-error").props.children).toBe(
      "Informe um valor válido maior que zero."
    );

    await fireEvent.changeText(
      screen.getByTestId("contribution-amount-input"),
      "500"
    );
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(mockCreateContribution).toHaveBeenCalledWith(fakeDb, {
        investmentId: "inv-1",
        amount: 500,
        contributedAt: expect.any(String),
        notes: null,
      });
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("handles create error", async () => {
    mockCreateContribution.mockRejectedValue(new Error("db error"));

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("contribution-amount-input"),
      "500"
    );
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("contribution-form-error").props.children).toBe(
        "Não foi possível salvar o aporte."
      );
    });
  });

  it("edits and updates a contribution, then cancels editing", async () => {
    const contribution = createMockContribution();
    const onSuccess = jest.fn();
    mockUpdateContribution.mockResolvedValue(contribution);

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution]}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("contribution-row-contrib-1")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));
    expect(screen.getByTestId("contribution-amount-input").props.value).toBe(
      "500,00"
    );
    expect(screen.getByTestId("contribution-notes-input").props.value).toBe(
      "Aporte mensal"
    );

    await fireEvent.changeText(
      screen.getByTestId("contribution-amount-input"),
      "750"
    );
    await fireEvent.changeText(
      screen.getByTestId("contribution-notes-input"),
      ""
    );
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(mockUpdateContribution).toHaveBeenCalledWith(fakeDb, "contrib-1", {
        amount: 750,
        contributedAt: expect.any(String),
        notes: null,
      });
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("does not prefill and preserves the amount in privacy mode when left empty", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const contribution = createMockContribution();
    const onSuccess = jest.fn();
    mockUpdateContribution.mockResolvedValue(contribution);

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution]}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));

    expect(screen.getByTestId("contribution-amount-input").props.value).toBe(
      ""
    );
    expect(screen.getByTestId("contribution-notes-input").props.value).toBe(
      "Aporte mensal"
    );

    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(mockUpdateContribution).toHaveBeenCalledWith(fakeDb, "contrib-1", {
        amount: undefined,
        contributedAt: expect.any(String),
        notes: "Aporte mensal",
      });
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("updates the amount in privacy mode when a new value is provided", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const contribution = createMockContribution();
    mockUpdateContribution.mockResolvedValue(contribution);

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));
    await fireEvent.changeText(
      screen.getByTestId("contribution-amount-input"),
      "750"
    );
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(mockUpdateContribution).toHaveBeenCalledWith(fakeDb, "contrib-1", {
        amount: 750,
        contributedAt: expect.any(String),
        notes: "Aporte mensal",
      });
    });
  });

  it("handles update error", async () => {
    const contribution = createMockContribution();
    mockUpdateContribution.mockRejectedValue(new Error("db error"));

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("contribution-form-error").props.children).toBe(
        "Não foi possível salvar o aporte."
      );
    });
  });

  it("deletes a contribution and handles delete error", async () => {
    const contribution = createMockContribution();
    const onSuccess = jest.fn();
    mockDeleteContribution
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution]}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));
    await fireEvent.press(screen.getByTestId("contribution-delete-button"));
    expect(screen.getByTestId("contribution-delete-confirm-box")).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("contribution-cancel-delete-button")
    );
    expect(screen.queryByTestId("contribution-delete-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("contribution-delete-button"));
    await fireEvent.press(
      screen.getByTestId("contribution-confirm-delete-button")
    );

    await waitFor(() => {
      expect(screen.getByTestId("contribution-form-error").props.children).toBe(
        "Não foi possível excluir o aporte."
      );
    });

    await fireEvent.press(
      screen.getByTestId("contribution-confirm-delete-button")
    );

    await waitFor(() => {
      expect(mockDeleteContribution).toHaveBeenCalledWith(fakeDb, "contrib-1");
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("renders and edits a contribution without notes", async () => {
    const contribution = createMockContribution({ notes: null });
    const withNotes = createMockContribution({
      id: "contrib-2",
      notes: "Outra observação",
    });
    const onSuccess = jest.fn();
    mockUpdateContribution.mockResolvedValue(contribution);

    await render(
      <ContributionFormModal
        visible
        investment={createMockInvestment()}
        contributions={[contribution, withNotes]}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("contribution-row-contrib-1")).toBeTruthy();
    expect(screen.getByText("Outra observação")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("contribution-edit-contrib-1"));
    expect(screen.getByTestId("contribution-notes-input").props.value).toBe("");

    await fireEvent.changeText(
      screen.getByTestId("contribution-amount-input"),
      "600"
    );
    await fireEvent.press(screen.getByTestId("contribution-submit-button"));

    await waitFor(() => {
      expect(mockUpdateContribution).toHaveBeenCalledWith(fakeDb, "contrib-1", {
        amount: 600,
        contributedAt: expect.any(String),
        notes: null,
      });
    });
    expect(onSuccess).toHaveBeenCalled();
  });
});
