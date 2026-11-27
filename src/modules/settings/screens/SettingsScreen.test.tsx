import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { DatabaseError } from "../../../database";
import { exportBackupFile } from "../../../shared/backupFiles";
import { authenticateWithBiometrics } from "../../../shared/biometrics";
import { useAppearance } from "../../../state/appearance";
import { useAppLock } from "../../../state/appLock";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { useProfile } from "../../../state/profile";
import { avatarPalette } from "../../../theme/colors";
import { SettingsScreen } from "./SettingsScreen";

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));
jest.mock("../../../shared/backupFiles", () => ({
  exportBackupFile: jest.fn(),
}));
jest.mock("../../../shared/biometrics", () => ({
  authenticateWithBiometrics: jest.fn(),
}));
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

const mockUseDatabase = jest.mocked(useDatabase);
const mockExportBackupFile = jest.mocked(exportBackupFile);
const mockAuthenticateWithBiometrics = jest.mocked(authenticateWithBiometrics);
const mockUseProfile = jest.mocked(useProfile);
const mockUseAppearance = jest.mocked(useAppearance);
const mockUsePrivacy = jest.mocked(usePrivacy);
const mockUseAppLock = jest.mocked(useAppLock);

describe("SettingsScreen", () => {
  const updateProfile = jest.fn().mockResolvedValue(undefined);
  const refreshProfile = jest.fn().mockResolvedValue(undefined);
  const setPreference = jest.fn();
  const togglePrivacy = jest.fn();
  const enableLock = jest.fn().mockResolvedValue(true);
  const disableLock = jest.fn().mockResolvedValue(true);
  const mockDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    mockUseDatabase.mockReturnValue(mockDb);
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

  it("exports backup with loading, sharing error propagation and generic error handling", async () => {
    await render(<SettingsScreen />);
    expect(screen.getByTestId("backup-security-notice")).toBeTruthy();

    let resolveExport!: (value: { fileName: string; fileUri: string }) => void;
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
    });

    await waitFor(() => {
      expect(screen.getByTestId("backup-success-message")).toBeTruthy();
      expect(
        screen.getByText(
          "Backup emdia-backup-20260310-100000.json exportado e pronto para compartilhamento."
        )
      ).toBeTruthy();
    });

    mockExportBackupFile.mockRejectedValueOnce(
      new DatabaseError(
        "VALIDATION_ERROR",
        "Compartilhamento de arquivos não está disponível neste dispositivo."
      )
    );
    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText(
          "Compartilhamento de arquivos não está disponível neste dispositivo."
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

  it("enforces biometric step-up auth on export and blocks actions when locked", async () => {
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

    mockAuthenticateWithBiometrics.mockResolvedValueOnce("cancelled");
    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText(
          "Autenticação cancelada. Exportação de backup abortada."
        )
      ).toBeTruthy();
    });
    expect(mockExportBackupFile).not.toHaveBeenCalled();

    mockAuthenticateWithBiometrics.mockResolvedValueOnce("error");
    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(
        screen.getByText(
          "Falha na autenticação biométrica. Exportação de backup abortada."
        )
      ).toBeTruthy();
    });
    expect(mockExportBackupFile).not.toHaveBeenCalled();

    mockAuthenticateWithBiometrics.mockResolvedValueOnce("authenticated");
    mockExportBackupFile.mockResolvedValueOnce({
      fileName: "emdia-backup-auth.json",
      fileUri: "file:///cache/emdia-backup-auth.json",
    });
    await fireEvent.press(screen.getByTestId("export-backup-button"));
    await waitFor(() => {
      expect(mockExportBackupFile).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(
          "Backup emdia-backup-auth.json exportado e pronto para compartilhamento."
        )
      ).toBeTruthy();
    });

    appLockState.isLocked = true;
    await view.rerender(<SettingsScreen />);

    await fireEvent.press(screen.getByTestId("export-backup-button"));
    expect(mockExportBackupFile).toHaveBeenCalledTimes(1);
    expect(mockAuthenticateWithBiometrics).toHaveBeenCalledTimes(3);
  });
});
