import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createTestDatabase } from "../../../../tests/helpers/inMemorySqlite";
import {
  createCategory,
  getGoalForMonth,
  getSelfOwner,
  listCategories,
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
const mockGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);

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

  it("persists profile updates in SQLite and performs real export and restore round-trip", async () => {
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

    await db.execAsync(`
      DELETE FROM category_budgets;
      DELETE FROM goals;
      DELETE FROM categories;
      UPDATE owners SET name = 'Temporario' WHERE is_self = 1 AND deleted_at IS NULL;
    `);
    expect((await getSelfOwner(db))?.name).toBe("Temporario");
    expect(await listCategories(db)).toHaveLength(0);
    expect(await getGoalForMonth(db, "2026-01")).toBeNull();

    const restoreFile = new File(Paths.cache, "roundtrip-backup.json");
    restoreFile.create({ intermediates: true, overwrite: true });
    restoreFile.write(exportedContent);

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "roundtrip-backup.json",
          uri: restoreFile.uri,
          lastModified: 1,
        },
      ],
    });

    await fireEvent.press(screen.getByTestId("restore-backup-button"));

    await waitFor(() => {
      expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("confirm-restore-button"));

    await waitFor(() => {
      expect(screen.getByTestId("backup-success-message")).toHaveTextContent(
        "Backup restaurado com sucesso."
      );
      expect(screen.getByTestId("profile-name")).toHaveTextContent(
        "Maria Clara"
      );
    });

    expect((await getSelfOwner(db))?.name).toBe("Maria Clara");
    const restoredCategories = await listCategories(db);
    expect(restoredCategories).toHaveLength(1);
    expect(restoredCategories[0].name).toBe("Moradia");
    expect(await getGoalForMonth(db, "2026-01")).toBe(4500);

    queryClient.clear();
  });
});
