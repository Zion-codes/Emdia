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
  type Category,
  type Goal,
  type Investment,
  type Owner,
  type OwnerStatement,
  addMonthsToMonthKey,
  getGoalForMonth,
  getOwnerStatement,
  listCategories,
  listContributions,
  listGoalHistory,
  listInvestments,
  listOwners,
} from "../../../database";
import { toMonthKey } from "../../../shared/utils/format";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { MoreScreen } from "./MoreScreen";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    listCategories: jest.fn(),
    listOwners: jest.fn(),
    getGoalForMonth: jest.fn(),
    listGoalHistory: jest.fn(),
    listInvestments: jest.fn(),
    listContributions: jest.fn(),
    getOwnerStatement: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    setCategoryBudget: jest.fn(),
    removeCategoryBudget: jest.fn(),
    createOwner: jest.fn(),
    updateOwner: jest.fn(),
    updateSelfOwnerName: jest.fn(),
    deleteOwner: jest.fn(),
    setGoalForMonth: jest.fn(),
    removeGoalFromMonth: jest.fn(),
    createInvestment: jest.fn(),
    updateInvestment: jest.fn(),
    deleteInvestment: jest.fn(),
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

const mockListCategories = jest.mocked(listCategories);
const mockListOwners = jest.mocked(listOwners);
const mockGetGoalForMonth = jest.mocked(getGoalForMonth);
const mockListGoalHistory = jest.mocked(listGoalHistory);
const mockListInvestments = jest.mocked(listInvestments);
const mockListContributions = jest.mocked(listContributions);
const mockGetOwnerStatement = jest.mocked(getOwnerStatement);
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

function createMockCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Mercado",
    color: "#3B82F6",
    icon: "home-outline",
    budget: null,
    transactionsCount: 0,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function createMockOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: "owner-1",
    name: "EU",
    isSelf: true,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function createMockInvestment(overrides: Partial<Investment> = {}): Investment {
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
    ...overrides,
  };
}

function createMockGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    since: "2026-11",
    amount: 1000,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function createMockStatement(
  overrides: Partial<OwnerStatement> = {}
): OwnerStatement {
  return {
    owner: createMockOwner(),
    period: "range",
    page: 1,
    pageSize: 20,
    totalPages: 1,
    items: [],
    totals: {
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      pendingTotal: 0,
      paidTotal: 0,
      overdueTotal: 0,
      totalCount: 0,
    },
    ...overrides,
  };
}

describe("MoreScreen", () => {
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

  it("shows loading states for all sections", async () => {
    mockListCategories.mockReturnValue(new Promise(() => undefined));
    mockListOwners.mockReturnValue(new Promise(() => undefined));
    mockGetGoalForMonth.mockReturnValue(new Promise(() => undefined));
    mockListInvestments.mockReturnValue(new Promise(() => undefined));
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    await renderWithQuery(<MoreScreen />);

    expect(screen.getByTestId("categories-loading")).toBeTruthy();
    expect(screen.getByTestId("owners-loading")).toBeTruthy();
    expect(screen.getByTestId("goal-loading")).toBeTruthy();
    expect(screen.getByTestId("investments-loading")).toBeTruthy();
  });

  it("shows error states and retries each section", async () => {
    mockListCategories
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    mockListOwners
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    mockGetGoalForMonth
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(null);
    mockListInvestments
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([]);
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("categories-error")).toBeTruthy();
      expect(screen.getByTestId("owners-error")).toBeTruthy();
      expect(screen.getByTestId("goal-error")).toBeTruthy();
      expect(screen.getByTestId("investments-error")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("categories-retry-button"));
    await waitFor(() => {
      expect(screen.getByTestId("categories-empty")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("owners-retry-button"));
    await waitFor(() => {
      expect(screen.getByTestId("owners-empty")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("goal-retry-button"));
    await waitFor(() => {
      expect(screen.getByTestId("goal-value").props.children).toBe(
        "Nenhuma meta definida"
      );
    });

    await fireEvent.press(screen.getByTestId("investments-retry-button"));
    await waitFor(() => {
      expect(screen.getByTestId("investments-empty")).toBeTruthy();
    });
  });

  it("shows empty states and opens add modals", async () => {
    mockListCategories.mockResolvedValue([]);
    mockListOwners.mockResolvedValue([]);
    mockGetGoalForMonth.mockResolvedValue(null);
    mockListInvestments.mockResolvedValue([]);
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("categories-empty")).toBeTruthy();
      expect(screen.getByTestId("owners-empty")).toBeTruthy();
      expect(screen.getByTestId("investments-empty")).toBeTruthy();
    });
    expect(screen.getByTestId("goal-value").props.children).toBe(
      "Nenhuma meta definida"
    );

    await fireEvent.press(screen.getByTestId("categories-add-button"));
    expect(screen.getByTestId("category-name-input")).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Mercado"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));
    await waitFor(() => {
      expect(screen.queryByTestId("category-name-input")).toBeNull();
    });

    await fireEvent.press(screen.getByTestId("owners-add-button"));
    expect(screen.getByTestId("owner-name-input")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("goal-edit-button"));
    expect(screen.getByTestId("goal-amount-input")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("investments-add-button"));
    expect(screen.getByTestId("investment-name-input")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
  });

  it("renders populated sections, changes month and opens edit modals", async () => {
    const initialMonth = toMonthKey(new Date());
    const nextMonth = addMonthsToMonthKey(initialMonth, 1);

    mockListCategories.mockResolvedValue([
      createMockCategory(),
      createMockCategory({
        id: "cat-2",
        name: "Lazer",
        color: null,
        budget: 300,
        transactionsCount: 2,
      }),
    ]);
    mockListOwners.mockResolvedValue([
      createMockOwner(),
      createMockOwner({
        id: "owner-2",
        name: "Maria",
        isSelf: false,
      }),
    ]);
    mockGetGoalForMonth.mockResolvedValue(1000);
    mockListInvestments.mockResolvedValue([
      createMockInvestment(),
      createMockInvestment({
        id: "inv-2",
        name: "CDB",
        institution: null,
        contributionsCount: 0,
      }),
    ]);
    mockListGoalHistory.mockResolvedValue([createMockGoal()]);
    mockListContributions.mockResolvedValue([]);

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("category-row-cat-1")).toBeTruthy();
      expect(screen.getByTestId("category-row-cat-2")).toBeTruthy();
      expect(screen.getByTestId("owner-row-owner-1")).toBeTruthy();
      expect(screen.getByTestId("owner-row-owner-2")).toBeTruthy();
      expect(screen.getByTestId("investment-row-inv-1")).toBeTruthy();
      expect(screen.getByTestId("investment-row-inv-2")).toBeTruthy();
    });
    expect(screen.getByText("Sem orçamento")).toBeTruthy();
    expect(screen.getByText(/Orçamento R\$ 300,00/)).toBeTruthy();
    expect(screen.getByText(/2 lançamentos/)).toBeTruthy();
    expect(screen.getByTestId("goal-value").props.children).toBe("R$ 1000,00");

    await fireEvent.press(screen.getByTestId("more-next-month"));

    await waitFor(() => {
      expect(mockListCategories).toHaveBeenCalledWith(fakeDb, {
        month: nextMonth,
      });
    });

    await fireEvent.press(screen.getByTestId("more-prev-month"));

    await waitFor(() => {
      expect(mockListCategories).toHaveBeenCalledWith(fakeDb, {
        month: initialMonth,
      });
    });

    await fireEvent.press(screen.getByTestId("category-edit-cat-1"));
    expect(screen.getByTestId("category-name-input").props.value).toBe(
      "Mercado"
    );
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("owner-edit-owner-2"));
    expect(screen.getByTestId("owner-name-input").props.value).toBe("Maria");
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("investment-edit-inv-1"));
    expect(screen.getByTestId("investment-name-input").props.value).toBe(
      "Tesouro Selic"
    );
    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
  });

  it("opens and closes the contributions modal", async () => {
    mockListCategories.mockResolvedValue([]);
    mockListOwners.mockResolvedValue([]);
    mockGetGoalForMonth.mockResolvedValue(null);
    mockListInvestments.mockResolvedValue([createMockInvestment()]);
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("investment-row-inv-1")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("investment-contributions-inv-1"));

    await waitFor(() => {
      expect(mockListContributions).toHaveBeenCalledWith(fakeDb, "inv-1");
      expect(screen.getByTestId("contribution-amount-input")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
    expect(screen.queryByTestId("contribution-amount-input")).toBeNull();
  });

  it("loads and closes the owner statement sheet", async () => {
    mockListCategories.mockResolvedValue([]);
    mockListOwners.mockResolvedValue([createMockOwner()]);
    mockGetGoalForMonth.mockResolvedValue(null);
    mockListInvestments.mockResolvedValue([]);
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    let resolveStatement!: (value: OwnerStatement) => void;
    mockGetOwnerStatement.mockImplementationOnce(
      () =>
        new Promise<OwnerStatement>((resolve) => {
          resolveStatement = resolve;
        })
    );

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-row-owner-1")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("owner-share-owner-1"));
    expect(screen.getByTestId("owner-statement-loading")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
    expect(screen.queryByTestId("owner-statement-loading")).toBeNull();

    resolveStatement(createMockStatement());
  });

  it("shares and errors the owner statement", async () => {
    mockListCategories.mockResolvedValue([]);
    mockListOwners.mockResolvedValue([
      createMockOwner(),
      createMockOwner({ id: "owner-2", name: "Maria", isSelf: false }),
    ]);
    mockGetGoalForMonth.mockResolvedValue(null);
    mockListInvestments.mockResolvedValue([]);
    mockListGoalHistory.mockResolvedValue([]);
    mockListContributions.mockResolvedValue([]);

    mockGetOwnerStatement.mockImplementation((_db, filter) =>
      filter.ownerId === "owner-1"
        ? Promise.resolve(createMockStatement())
        : Promise.reject(new Error("fail"))
    );

    await renderWithQuery(<MoreScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-row-owner-1")).toBeTruthy();
      expect(screen.getByTestId("owner-row-owner-2")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("owner-share-owner-1"));
    await waitFor(() => {
      expect(screen.getByTestId("share-preview-text")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("modal-sheet-close"));

    await fireEvent.press(screen.getByTestId("owner-share-owner-2"));
    await waitFor(() => {
      expect(screen.getByTestId("owner-statement-error")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("modal-sheet-close"));
    expect(screen.queryByTestId("owner-statement-error")).toBeNull();
  });
});
