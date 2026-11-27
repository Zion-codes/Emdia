import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createTestDatabase } from "../../../../tests/helpers/inMemorySqlite";
import {
  createCategory,
  getSelfOwner,
  setGoalForMonth,
} from "../../../database";
import * as databaseClient from "../../../database/client";
import { AppearanceProvider } from "../../../state/appearance";
import { AppLockProvider } from "../../../state/appLock";
import { DatabaseProvider } from "../../../state/database";
import { PrivacyProvider } from "../../../state/privacy";
import { ProfileProvider } from "../../../state/profile";
import { avatarPalette } from "../../../theme/colors";
import { SettingsScreen } from "./SettingsScreen";

const mockShareAsync = jest.mocked(Sharing.shareAsync);

async function renderSettingsWithRealProviders(): Promise<{
  queryClient: QueryClient;
}> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppearanceProvider>
        <AppLockProvider>
          <DatabaseProvider>
            <QueryClientProvider client={queryClient}>
              <PrivacyProvider>
                <ProfileProvider>
                  <SettingsScreen />
                </ProfileProvider>
              </PrivacyProvider>
            </QueryClientProvider>
          </DatabaseProvider>
        </AppLockProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );

  return { queryClient };
}

describe("SettingsScreen integration with real in-memory SQLite", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    jest.spyOn(databaseClient, "openDatabase").mockResolvedValue(db);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.closeAsync();
  });

  it("persists profile updates in SQLite and exports real backup JSON", async () => {
    await createCategory(db, {
      name: "Moradia",
      color: "#0EA5E9",
      icon: "home",
    });
    await setGoalForMonth(db, "2026-01", 4500);

    const { queryClient } = await renderSettingsWithRealProviders();

    await waitFor(() => {
      expect(screen.getByTestId("settings-screen")).toBeTruthy();
      expect(screen.getByTestId("profile-name")).toHaveTextContent("EU");
    });

    await fireEvent.press(screen.getByTestId("edit-profile-button"));
    expect(screen.getByTestId("edit-profile-modal")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("profile-name-input"),
      "Maria Clara"
    );
    await fireEvent.press(
      screen.getByTestId(`avatar-color-${avatarPalette[2]}`)
    );
    await fireEvent.press(screen.getByTestId("save-profile-button"));

    await waitFor(() => {
      expect(screen.getByTestId("profile-name")).toHaveTextContent(
        "Maria Clara"
      );
    });

    const persistedOwner = await getSelfOwner(db);
    expect(persistedOwner?.name).toBe("Maria Clara");

    let exportedContent = "";
    mockShareAsync.mockImplementationOnce(async (uri) => {
      exportedContent = await new File(uri).text();
    });

    await fireEvent.press(screen.getByTestId("export-backup-button"));

    await waitFor(() => {
      expect(screen.getByTestId("backup-success-message")).toBeTruthy();
    });
    expect(exportedContent.length).toBeGreaterThan(0);

    queryClient.clear();
  });
});
