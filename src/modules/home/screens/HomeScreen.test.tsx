import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { getMonthlySummary, type MonthlySummary } from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import { useProfile } from "../../../state/profile";
import { avatarPalette } from "../../../theme/colors";
import { HomeScreen } from "./HomeScreen";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    getMonthlySummary: jest.fn(),
  };
});
jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../state/profile", () => ({
  useProfile: jest.fn(),
}));
jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
}));

const mockGetMonthlySummary = jest.mocked(getMonthlySummary);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseProfile = jest.mocked(useProfile);
const mockUseMoney = jest.mocked(useMoney);

function createSampleSummary(
  overrides: Partial<MonthlySummary> = {}
): MonthlySummary {
  return {
    month: "2026-11",
    ownerId: null,
    totals: {
      incomeTotal: 5000,
      expenseTotal: 3200,
      cashFlow: 1800,
      paidIncomeTotal: 5000,
      paidExpenseTotal: 2000,
      realizedCashFlow: 3000,
    },
    comparison: {
      previousMonth: "2026-10",
      incomeTotal: 4000,
      expenseTotal: 3000,
      cashFlow: 1000,
      incomeDelta: 1000,
      expenseDelta: 200,
      cashFlowDelta: 800,
      incomeChangePercent: 25,
      expenseChangePercent: 6.67,
      cashFlowChangePercent: 80,
    },
    overdueCount: 0,
    overdueAmount: 0,
    toPayAmount: 1200,
    categoryBudgets: [],
    goalAmount: 2000,
    ...overrides,
  };
}

async function renderWithQueryClient(): Promise<QueryClient> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  await render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>
  );

  return queryClient;
}

describe("HomeScreen", () => {
  const mockDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    mockUseDatabase.mockReturnValue(mockDb);
    mockUseProfile.mockReturnValue({
      profile: { name: "Ana Paula", avatarColor: avatarPalette[0] },
      isLoaded: true,
      updateProfile: jest.fn(),
      refreshProfile: jest.fn(),
    });
    mockUseMoney.mockReturnValue((value: number) => `R$ ${value.toFixed(2)}`);
  });

  it("renders loading state and then full monthly summary with overdue alert, goal and budgets", async () => {
    let resolveSummary!: (value: MonthlySummary) => void;
    mockGetMonthlySummary.mockReturnValueOnce(
      new Promise<MonthlySummary>((resolve) => {
        resolveSummary = resolve;
      })
    );

    const queryClient = await renderWithQueryClient();

    expect(screen.getByTestId("home-loading")).toBeTruthy();
    expect(screen.getByTestId("home-greeting")).toHaveTextContent(
      "Olá, Ana Paula"
    );

    resolveSummary(
      createSampleSummary({
        overdueCount: 1,
        overdueAmount: 450,
        categoryBudgets: [
          {
            categoryId: "cat-1",
            categoryName: "Alimentação",
            categoryColor: "#10B981",
            categoryIcon: "restaurant",
            budgetAmount: 1000,
            spentAmount: 1200,
            remainingAmount: -200,
            percentage: 120,
            isExceeded: true,
          },
          {
            categoryId: "cat-2",
            categoryName: "Transporte",
            categoryColor: null,
            categoryIcon: null,
            budgetAmount: 500,
            spentAmount: 250,
            remainingAmount: 250,
            percentage: 50,
            isExceeded: false,
          },
        ],
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId("home-summary")).toBeTruthy();
    });

    expect(screen.getByTestId("home-cash-flow")).toHaveTextContent(
      "R$ 1800.00"
    );
    expect(screen.getByTestId("home-realized-cash-flow")).toHaveTextContent(
      "Realizado: R$ 3000.00"
    );
    expect(screen.getByTestId("home-income-total")).toHaveTextContent(
      "R$ 5000.00"
    );
    expect(screen.getByTestId("home-expense-total")).toHaveTextContent(
      "R$ 3200.00"
    );
    expect(screen.getByTestId("home-to-pay-amount")).toHaveTextContent(
      "R$ 1200.00"
    );
    expect(screen.getByTestId("home-overdue-alert")).toHaveTextContent(
      "1 parcela vencida (R$ 450.00)"
    );
    expect(screen.getByTestId("home-goal-amount")).toHaveTextContent(
      "R$ 2000.00"
    );
    expect(screen.getByTestId("home-goal-progress")).toHaveTextContent(
      "90% da meta atingida"
    );
    expect(screen.getByTestId("home-budget-cat-1")).toHaveTextContent(/120%/);
    expect(screen.getByTestId("home-budget-cat-2")).toHaveTextContent(/50%/);

    queryClient.clear();
  });

  it("renders negative cash flow, multiple overdue items and empty goal/budgets states", async () => {
    mockGetMonthlySummary.mockResolvedValueOnce(
      createSampleSummary({
        totals: {
          incomeTotal: 1000,
          expenseTotal: 1500,
          cashFlow: -500,
          paidIncomeTotal: 1000,
          paidExpenseTotal: 1500,
          realizedCashFlow: -500,
        },
        overdueCount: 3,
        overdueAmount: 900,
        goalAmount: null,
        categoryBudgets: [],
      })
    );

    const queryClient = await renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("home-summary")).toBeTruthy();
    });

    expect(screen.getByTestId("home-cash-flow")).toHaveTextContent(
      "R$ -500.00"
    );
    expect(screen.getByTestId("home-overdue-alert")).toHaveTextContent(
      "3 parcelas vencidas (R$ 900.00)"
    );
    expect(screen.getByTestId("home-goal-empty")).toBeTruthy();
    expect(screen.getByTestId("home-budgets-empty")).toBeTruthy();

    queryClient.clear();
  });

  it("clamps non-finite goal progress to 0% when goalAmount is zero", async () => {
    mockGetMonthlySummary.mockResolvedValueOnce(
      createSampleSummary({
        goalAmount: 0,
      })
    );

    const queryClient = await renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("home-summary")).toBeTruthy();
    });

    expect(screen.getByTestId("home-goal-progress")).toHaveTextContent(
      "0% da meta atingida"
    );

    queryClient.clear();
  });

  it("renders error state and retries loading when retry button is pressed", async () => {
    mockGetMonthlySummary
      .mockRejectedValueOnce(new Error("db error"))
      .mockResolvedValueOnce(createSampleSummary());

    const queryClient = await renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("home-error")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("home-retry-button"));

    await waitFor(() => {
      expect(screen.getByTestId("home-summary")).toBeTruthy();
    });
    expect(mockGetMonthlySummary).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });

  it("navigates to previous and next month", async () => {
    mockGetMonthlySummary.mockResolvedValue(createSampleSummary());

    const queryClient = await renderWithQueryClient();

    await waitFor(() => {
      expect(screen.getByTestId("home-summary")).toBeTruthy();
    });
    expect(mockGetMonthlySummary).toHaveBeenCalledWith(mockDb, {
      month: "2026-11",
    });

    await fireEvent.press(screen.getByTestId("prev-month-button"));
    await waitFor(() => {
      expect(mockGetMonthlySummary).toHaveBeenCalledWith(mockDb, {
        month: "2026-10",
      });
    });

    await fireEvent.press(screen.getByTestId("next-month-button"));
    await waitFor(() => {
      expect(mockGetMonthlySummary).toHaveBeenCalledWith(mockDb, {
        month: "2026-11",
      });
    });

    queryClient.clear();
  });
});
