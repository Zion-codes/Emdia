import { useQueryClient } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupPayloadV1,
  DatabaseError,
  restoreDatabaseBackup,
} from "../../../database";
import {
  createSafetyBackupFile,
  exportBackupFile,
  pickBackupFile,
} from "../../../shared/backupFiles";
import { useAppearance } from "../../../state/appearance";
import { useAppLock } from "../../../state/appLock";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { useProfile } from "../../../state/profile";
import { avatarPalette } from "../../../theme/colors";
import { SettingsScreen } from "./SettingsScreen";

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(),
}));
jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../shared/backupFiles", () => ({
  exportBackupFile: jest.fn(),
  pickBackupFile: jest.fn(),
  createSafetyBackupFile: jest.fn(),
}));
jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    restoreDatabaseBackup: jest.fn(),
  };
});
jest.mock("../../../state/profile", () => ({
  useProfile: jest.fn(),
}));
jest.mock("../../../state/appearance", () => ({
  useAppearance: jest.fn(),
  useAppearancePreference: (): "system" => "system",
}));
jest.mock("../../../state/privacy", () => ({
  usePrivacy: jest.fn(),
}));
jest.mock("../../../state/appLock", () => ({
  useAppLock: jest.fn(),
}));

const mockUseQueryClient = jest.mocked(useQueryClient);
const mockUseDatabase = jest.mocked(useDatabase);
const mockExportBackupFile = jest.mocked(exportBackupFile);
const mockPickBackupFile = jest.mocked(pickBackupFile);
const mockCreateSafetyBackupFile = jest.mocked(createSafetyBackupFile);
const mockRestoreDatabaseBackup = jest.mocked(restoreDatabaseBackup);
const mockUseProfile = jest.mocked(useProfile);
const mockUseAppearance = jest.mocked(useAppearance);
const mockUsePrivacy = jest.mocked(usePrivacy);
const mockUseAppLock = jest.mocked(useAppLock);

function createSampleBackupPayload(
  exportedAt = "2026-03-10T10:00:00.000Z"
): BackupPayloadV1 {
  const ts = "2026-03-10T10:00:00.000Z";
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: 1,
    exportedAt,
    data: {
      categories: [],
      owners: [
        {
          id: "owner-self",
          name: "Ana Paula",
          is_self: 1,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        },
      ],
      invoices: [],
      goals: [],
      investments: [],
      app_settings: [],
      category_budgets: [],
      transactions: [],
      installments: [],
      investment_contributions: [],
    },
  };
}

describe("SettingsScreen", () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  const refreshProfile = jest.fn().mockResolvedValue(undefined);
  const setPreference = jest.fn();
  const togglePrivacy = jest.fn();
  const enableLock = jest.fn().mockResolvedValue(true);
  const disableLock = jest.fn().mockResolvedValue(true);
  const invalidateQueries = jest.fn().mockResolvedValue(undefined);
  const mockDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    mockUseDatabase.mockReturnValue(mockDb);
    mockUseQueryClient.mockReturnValue({
      invalidateQueries,
    } as unknown as ReturnType<typeof useQueryClient>);
    mockUseProfile.mockReturnValue({
      profile: { name: "Ana Paula", avatarColor: avatarPalette[0] },
      isLoaded: true,
      updateProfile,
      refreshProfile,
    });
    mockUseAppearance.mockReturnValue({
      preference: "system",
      setPreference,
    });
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: togglePrivacy,
    });
    mockUseAppLock.mockReturnValue({
      isInitialized: true,
      isEnabled: false,
      isAvailable: true,
      isLocked: false,
      isAuthenticating: false,
      errorMessage: null,
      enable: enableLock,
      disable: disableLock,
      unlock: jest.fn(),
    });
  });

  it("renders local profile, appearance, privacy and biometric lock controls", async () => {
    await render(<SettingsScreen />);

    expect(screen.getByText("Configurações")).toBeTruthy();
    expect(screen.getByText("AP")).toBeTruthy();
    expect(screen.getByTestId("profile-name").props.children).toBe("Ana Paula");

    await fireEvent.press(screen.getByTestId("appearance-option-dark"));
    expect(setPreference).toHaveBeenCalledWith("dark");

    await fireEvent(screen.getByTestId("privacy-toggle"), "valueChange", true);
    expect(togglePrivacy).toHaveBeenCalledTimes(1);

    await fireEvent(
      screen.getByTestId("biometric-lock-toggle"),
      "valueChange",
      true
    );
    expect(enableLock).toHaveBeenCalledTimes(1);
  });

  it("edits profile name and color with empty validation and error handling", async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByTestId("edit-profile-button"));
    expect(screen.getByTestId("edit-profile-modal")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("profile-name-input"), "   ");
    await fireEvent.press(screen.getByTestId("save-profile-button"));
    expect(screen.getByTestId("profile-name-error")).toBeTruthy();

    await fireEvent.changeText(
      screen.getByTestId("profile-name-input"),
      "João Pedro"
    );
    expect(screen.queryByTestId("profile-name-error")).toBeNull();

    let resolveUpdate!: () => void;
    updateProfile.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      })
    );

    await fireEvent.press(
      screen.getByTestId(`avatar-color-${avatarPalette[2]}`)
    );
    await fireEvent.press(screen.getByTestId("save-profile-button"));

    expect(
      screen.getByTestId("save-profile-button").props.accessibilityState
        .disabled
    ).toBe(true);

    resolveUpdate();

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        name: "João Pedro",
        avatarColor: avatarPalette[2],
      });
    });

    updateProfile.mockRejectedValueOnce(new Error("db fail"));
    await fireEvent.press(screen.getByTestId("edit-profile-button"));
    await fireEvent.press(screen.getByTestId("save-profile-button"));

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível salvar o perfil.")
      ).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId("cancel-profile-button"));
  });

  it("shows unavailable biometrics helper, error message, disable flow and fallback initials", async () => {
    mockUseProfile.mockReturnValue({
      profile: { name: "   ", avatarColor: avatarPalette[1] },
      isLoaded: true,
      updateProfile,
      refreshProfile,
    });
    mockUseAppLock.mockReturnValue({
      isInitialized: true,
      isEnabled: true,
      isAvailable: false,
      isLocked: false,
      isAuthenticating: false,
      errorMessage: "Erro biométrico.",
      enable: enableLock,
      disable: disableLock,
      unlock: jest.fn(),
    });

    await render(<SettingsScreen />);

    expect(screen.getByText("EU")).toBeTruthy();
    expect(screen.getByTestId("biometrics-unavailable-text")).toBeTruthy();
    expect(screen.getByTestId("biometric-lock-error")).toBeTruthy();

    fireEvent(
      screen.getByTestId("biometric-lock-toggle"),
      "valueChange",
      false
    );
    expect(disableLock).toHaveBeenCalledTimes(1);
  });

  it("renders single-word profile initials correctly", async () => {
    mockUseProfile.mockReturnValue({
      profile: { name: "Carlos", avatarColor: avatarPalette[0] },
      isLoaded: true,
      updateProfile,
      refreshProfile,
    });

    await render(<SettingsScreen />);
    expect(screen.getByText("CA")).toBeTruthy();
  });

  it("exports backup with loading, shared/local feedback and error handling", async () => {
    await render(<SettingsScreen />);
    expect(screen.getByTestId("backup-security-notice")).toBeTruthy();

    let resolveExport!: (value: {
      fileName: string;
      fileUri: string;
      shared: boolean;
    }) => void;
    mockExportBackupFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExport = resolve;
      })
    );

    await fireEvent.press(screen.getByTestId("export-backup-button"));
    expect(screen.getByText("Exportando...")).toBeTruthy();
    expect(
      screen.getByTestId("export-backup-button").props.accessibilityState
        .disabled
    ).toBe(true);

    resolveExport({
      fileName: "emdia-backup-20260310-100000.json",
      fileUri: "file:///cache/emdia-backup-20260310-100000.json",
      shared: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("backup-success-message")).toBeTruthy();
    });

    mockExportBackupFile.mockResolvedValueOnce({
      fileName: "emdia-backup-20260310-100001.json",
      fileUri: "file:///cache/emdia-backup-20260310-100001.json",
      shared: false,
    });

    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText(
          "Backup salvo localmente em emdia-backup-20260310-100001.json."
        )
      ).toBeTruthy();
    });

    mockExportBackupFile.mockRejectedValueOnce(new Error("io error"));
    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível exportar o backup.")
      ).toBeTruthy();
    });
  });

  it("handles restore cancel, validation errors, modal cancellation and full restore flow", async () => {
    await render(<SettingsScreen />);

    mockPickBackupFile.mockResolvedValueOnce(null);
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    expect(screen.queryByTestId("restore-backup-modal")).toBeNull();

    mockPickBackupFile.mockResolvedValueOnce({
      fileName: "invalid.json",
      content: JSON.stringify({ app: "other" }),
    });
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(screen.getByTestId("backup-error-message")).toBeTruthy();
    });

    mockPickBackupFile.mockRejectedValueOnce(new Error("permission denied"));
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível ler o arquivo de backup.")
      ).toBeTruthy();
    });

    const payloadValidForCancel = createSampleBackupPayload();
    mockPickBackupFile.mockResolvedValueOnce({
      fileName: "backup-cancel.json",
      content: JSON.stringify(payloadValidForCancel),
    });
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();
    });
    expect(screen.getByTestId("restore-destructive-warning")).toBeTruthy();
    expect(screen.getByTestId("restore-backup-summary")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("cancel-restore-button"));
    expect(screen.queryByTestId("restore-backup-modal")).toBeNull();

    const payloadValid = createSampleBackupPayload();
    mockPickBackupFile.mockResolvedValueOnce({
      fileName: "backup-ok.json",
      content: JSON.stringify(payloadValid),
    });
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();
    });

    let resolveSafety!: () => void;
    mockCreateSafetyBackupFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSafety = () =>
          resolve({
            fileName: "emdia-safety.json",
            fileUri: "file:///documents/safety-backups/emdia-safety.json",
          });
      })
    );
    mockRestoreDatabaseBackup.mockResolvedValueOnce({
      schemaVersion: 1,
      restoredCounts: {
        categories: 0,
        owners: 1,
        invoices: 0,
        goals: 0,
        investments: 0,
        app_settings: 0,
        category_budgets: 0,
        transactions: 0,
        installments: 0,
        investment_contributions: 0,
      },
      recurrence: {
        createdInstallmentsCount: 0,
        deactivatedTransactionsCount: 0,
      },
    });

    await fireEvent.press(screen.getByTestId("confirm-restore-button"));
    expect(screen.getAllByText("Restaurando...").length).toBeGreaterThan(0);
    await fireEvent(screen.getByTestId("restore-backup-modal"), "requestClose");
    expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();

    resolveSafety();

    await waitFor(() => {
      expect(screen.getByTestId("backup-success-message")).toBeTruthy();
    });
    expect(mockCreateSafetyBackupFile).toHaveBeenCalledWith(mockDb);
    expect(mockRestoreDatabaseBackup).toHaveBeenCalledWith(
      mockDb,
      payloadValid
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(refreshProfile).toHaveBeenCalledTimes(1);

    mockPickBackupFile.mockResolvedValueOnce({
      fileName: "backup-fail.json",
      content: JSON.stringify(payloadValid),
    });
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();
    });

    mockCreateSafetyBackupFile.mockRejectedValueOnce(
      new DatabaseError("VALIDATION_ERROR", "safety write failed")
    );
    await fireEvent.press(screen.getByTestId("confirm-restore-button"));
    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível restaurar o backup selecionado.")
      ).toBeTruthy();
    });
  });

  it("hides restore confirmation modal while app lock is active", async () => {
    const appLockState = {
      isInitialized: true,
      isEnabled: true,
      isAvailable: true,
      isLocked: false,
      isAuthenticating: false,
      errorMessage: null,
      enable: enableLock,
      disable: disableLock,
      unlock: jest.fn(),
    };
    mockUseAppLock.mockImplementation(() => appLockState);

    const view = await render(<SettingsScreen />);

    mockPickBackupFile.mockResolvedValueOnce({
      fileName: "backup-lock.json",
      content: JSON.stringify(createSampleBackupPayload()),
    });
    await fireEvent.press(screen.getByTestId("restore-backup-button"));
    await waitFor(() => {
      expect(screen.getByTestId("restore-backup-modal")).toBeTruthy();
    });

    appLockState.isLocked = true;
    await view.rerender(<SettingsScreen />);
    expect(screen.queryByTestId("restore-backup-modal")).toBeNull();
  });
});
