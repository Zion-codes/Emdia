import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { AppState, type AppStateStatus } from "react-native";
import { ensureRecurringInstallments } from "../database";
import { useDatabase } from "./database";
import { RecurrenceSync } from "./recurrence";

jest.mock("../database", () => ({
  ensureRecurringInstallments: jest.fn(),
}));

jest.mock("./database", () => ({
  useDatabase: jest.fn(),
}));

const mockEnsureRecurringInstallments = jest.mocked(
  ensureRecurringInstallments
);
const mockUseDatabase = jest.mocked(useDatabase);

function createMockDb(): SQLite.SQLiteDatabase {
  return {
    execAsync: jest.fn(),
  } as unknown as SQLite.SQLiteDatabase;
}

describe("RecurrenceSync", () => {
  let mockDb: SQLite.SQLiteDatabase;
  let queryClient: QueryClient;
  let appStateListener: ((state: AppStateStatus) => void) | null;
  let removeMock: jest.Mock;
  let originalCurrentState: AppStateStatus;

  beforeEach(() => {
    mockDb = createMockDb();
    mockUseDatabase.mockReturnValue(mockDb);
    queryClient = new QueryClient();
    appStateListener = null;
    removeMock = jest.fn();
    originalCurrentState = AppState.currentState;
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "active",
    });

    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener as (state: AppStateStatus) => void;
        return {
          remove: removeMock,
        } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: originalCurrentState,
    });
    queryClient.clear();
  });

  function renderRecurrenceSync(): ReturnType<typeof render> {
    return render(
      <QueryClientProvider client={queryClient}>
        <RecurrenceSync />
      </QueryClientProvider>
    );
  }

  it("runs on startup and invalidates queries when installments are created or transactions deactivated", async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    mockEnsureRecurringInstallments.mockResolvedValueOnce({
      createdInstallmentsCount: 2,
      deactivatedTransactionsCount: 0,
    });

    await renderRecurrenceSync();

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledWith(mockDb);
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    mockEnsureRecurringInstallments.mockResolvedValueOnce({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 1,
    });

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("does not invalidate queries when nothing changed and ignores non-foreground transitions", async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    mockEnsureRecurringInstallments.mockResolvedValue({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 0,
    });

    await renderRecurrenceSync();

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      appStateListener?.("active");
      appStateListener?.("background");
      appStateListener?.("inactive");
    });

    expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("prevents concurrent executions while a sync is already in flight", async () => {
    let resolveFirst!: (value: {
      createdInstallmentsCount: number;
      deactivatedTransactionsCount: number;
    }) => void;
    const firstPromise = new Promise<{
      createdInstallmentsCount: number;
      deactivatedTransactionsCount: number;
    }>((resolve) => {
      resolveFirst = resolve;
    });

    mockEnsureRecurringInstallments.mockReturnValueOnce(firstPromise);

    await renderRecurrenceSync();

    expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });

    expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({
        createdInstallmentsCount: 0,
        deactivatedTransactionsCount: 0,
      });
      await firstPromise;
    });

    mockEnsureRecurringInstallments.mockResolvedValueOnce({
      createdInstallmentsCount: 0,
      deactivatedTransactionsCount: 0,
    });

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(2);
    });
  });

  it("handles errors without crashing and releases the concurrency lock", async () => {
    mockEnsureRecurringInstallments
      .mockRejectedValueOnce(new Error("db failure"))
      .mockResolvedValueOnce({
        createdInstallmentsCount: 0,
        deactivatedTransactionsCount: 0,
      });

    await renderRecurrenceSync();

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(mockEnsureRecurringInstallments).toHaveBeenCalledTimes(2);
    });
  });

  it("removes AppState listener on unmount and ignores post-unmount resolution", async () => {
    const invalidateSpy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    let resolvePending!: (value: {
      createdInstallmentsCount: number;
      deactivatedTransactionsCount: number;
    }) => void;
    const pendingPromise = new Promise<{
      createdInstallmentsCount: number;
      deactivatedTransactionsCount: number;
    }>((resolve) => {
      resolvePending = resolve;
    });

    mockEnsureRecurringInstallments.mockReturnValueOnce(pendingPromise);

    const rendered = await renderRecurrenceSync();
    await rendered.unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePending({
        createdInstallmentsCount: 3,
        deactivatedTransactionsCount: 0,
      });
      await pendingPromise;
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
