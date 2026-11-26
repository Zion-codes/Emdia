const mockKvStore = new Map<string, string>();

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default
);

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(async () => {
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
      withExclusiveTransactionAsync: jest.fn(
        async (task: (txn: unknown) => Promise<void>) => {
          await task(db);
        }
      ),
      closeAsync: jest.fn().mockResolvedValue(undefined),
    };
    return db;
  }),
}));

jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItemAsync: jest.fn(async (key: string) => mockKvStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mockKvStore.set(key, value);
    }),
    removeItemAsync: jest.fn(async (key: string) => mockKvStore.delete(key)),
    clearAsync: jest.fn(async () => {
      mockKvStore.clear();
      return true;
    }),
  },
}));

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  mockKvStore.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});
