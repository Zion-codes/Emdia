const mockKvStore = new Map<string, string>();
const mockFileContents = new Map<string, string>();
const mockCreatedDirectories = new Set<string>();

function joinMockUri(...parts: (string | { uri: string })[]): string {
  const segments = parts.map((part) =>
    typeof part === "string" ? part : part.uri
  );
  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/\/+$/, "");
      }
      return segment.replace(/^\/+|\/+$/g, "");
    })
    .filter((segment) => segment.length > 0)
    .join("/");
}

class MockDirectory {
  uri: string;

  constructor(...uris: (string | { uri: string })[]) {
    this.uri = joinMockUri(...uris);
  }

  get exists(): boolean {
    return mockCreatedDirectories.has(this.uri);
  }

  create = jest.fn((): void => {
    mockCreatedDirectories.add(this.uri);
  });

  list = jest.fn((): MockFile[] => {
    const prefix = `${this.uri}/`;
    const files: MockFile[] = [];
    for (const uri of mockFileContents.keys()) {
      if (uri.startsWith(prefix)) {
        files.push(new MockFile(uri));
      }
    }
    return files;
  });
}

class MockFile {
  uri: string;

  constructor(...uris: (string | { uri: string })[]) {
    this.uri = joinMockUri(...uris);
  }

  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }

  get size(): number {
    const content = mockFileContents.get(this.uri);
    return content ? content.length : 0;
  }

  get exists(): boolean {
    return mockFileContents.has(this.uri);
  }

  create(): void {
    if (!mockFileContents.has(this.uri)) {
      mockFileContents.set(this.uri, "");
    }
  }

  write = jest.fn((content: string): void => {
    mockFileContents.set(this.uri, content);
  });

  text = jest.fn(async (): Promise<string> => {
    const content = mockFileContents.get(this.uri);
    if (content === undefined) {
      throw new Error(`File not found: ${this.uri}`);
    }
    return content;
  });

  delete(): void {
    mockFileContents.delete(this.uri);
  }
}

jest.mock("expo-file-system", () => ({
  Paths: {
    cache: new MockDirectory("file:///cache"),
    document: new MockDirectory("file:///documents"),
  },
  Directory: MockDirectory,
  File: MockFile,
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({
    canceled: true,
    assets: null,
  })),
}));

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

jest.mock("expo-local-authentication", () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: function MockDateTimePicker(props: Record<string, unknown>) {
      return React.createElement(View, {
        testID: "native-date-time-picker",
        ...props,
      });
    },
  };
});

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  mockKvStore.clear();
  mockFileContents.clear();
  mockCreatedDirectories.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});
