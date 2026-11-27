import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import Storage from "expo-sqlite/kv-store";
import { type JSX, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { AppLockProvider, useAppLock } from "./appLock";

const mockHasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const mockIsEnrolled = jest.mocked(LocalAuthentication.isEnrolledAsync);
const mockAuthenticate = jest.mocked(LocalAuthentication.authenticateAsync);

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <AppLockProvider>{children}</AppLockProvider>;
}

describe("AppLockProvider", () => {
  beforeEach(() => {
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(true);
    mockAuthenticate.mockResolvedValue({ success: true });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(() => ({ remove: jest.fn() }));
  });

  it("loads disabled by default, sets isInitialized, and enables after biometric confirmation", async () => {
    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.isAvailable).toBe(true);
    });

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isLocked).toBe(false);

    let enabled = false;
    await act(async () => {
      enabled = await result.current.enable();
    });

    expect(enabled).toBe(true);
    expect(result.current.isEnabled).toBe(true);
    await expect(Storage.getItemAsync("biometric_lock_enabled")).resolves.toBe(
      "true"
    );
  });

  it("starts locked and unlocks automatically on mount when enabled", async () => {
    await Storage.setItemAsync("biometric_lock_enabled", "true");

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });
    expect(mockAuthenticate).toHaveBeenCalled();
  });

  it("locks on background (Android and iOS background -> inactive -> active) and ignores inactive -> active without background", async () => {
    await Storage.setItemAsync("biometric_lock_enabled", "true");

    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    const addSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.isEnabled).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    mockAuthenticate.mockClear();

    await act(async () => {
      appStateListener?.("inactive");
      appStateListener?.("active");
    });

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(result.current.isLocked).toBe(false);

    await act(async () => {
      appStateListener?.("background");
    });
    expect(result.current.isLocked).toBe(true);

    await act(async () => {
      appStateListener?.("inactive");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      expect(result.current.isLocked).toBe(false);
    });

    addSpy.mockRestore();
  });

  it("ignores background event when disabled", async () => {
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    const addSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });

    expect(result.current.isLocked).toBe(false);
    expect(mockAuthenticate).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });

  it("handles unavailable, cancelled and error states on enable and disable", async () => {
    mockHasHardware.mockResolvedValue(false);

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAvailable).toBe(false);
    });

    let success = true;
    await act(async () => {
      success = await result.current.enable();
    });
    expect(success).toBe(false);
    expect(result.current.errorMessage).toBe(
      "Biometria não disponível ou não cadastrada neste dispositivo."
    );

    mockHasHardware.mockResolvedValue(true);
    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    });

    await act(async () => {
      success = await result.current.enable();
    });
    expect(success).toBe(false);
    expect(result.current.errorMessage).toBe(
      "Autenticação cancelada. Toque em Desbloquear para tentar novamente."
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "passcode_not_set",
    });
    await act(async () => {
      success = await result.current.enable();
    });
    expect(success).toBe(false);
    expect(result.current.errorMessage).toBe(
      "Biometria indisponível neste dispositivo."
    );

    mockAuthenticate.mockResolvedValueOnce({ success: true });
    await act(async () => {
      success = await result.current.enable();
    });
    expect(success).toBe(true);

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "authentication_failed",
    });
    await act(async () => {
      success = await result.current.disable();
    });
    expect(success).toBe(false);
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.errorMessage).toBe(
      "Não foi possível validar sua biometria. Tente novamente."
    );

    mockAuthenticate.mockResolvedValueOnce({ success: true });
    await act(async () => {
      success = await result.current.disable();
    });
    expect(success).toBe(true);
    expect(result.current.isEnabled).toBe(false);

    mockAuthenticate.mockResolvedValueOnce({ success: true });
    await act(async () => {
      success = await result.current.enable();
    });
    expect(success).toBe(true);

    mockHasHardware.mockResolvedValueOnce(false);
    await act(async () => {
      success = await result.current.disable();
    });
    expect(success).toBe(true);
    expect(result.current.isEnabled).toBe(false);
  });

  it("prevents permanent lockout by disabling lock when unlock returns unavailable, and handles concurrent unlock calls", async () => {
    await Storage.setItemAsync("biometric_lock_enabled", "true");

    let resolveAuth!: (
      value: LocalAuthentication.LocalAuthenticationResult
    ) => void;
    mockAuthenticate.mockImplementationOnce(
      () =>
        new Promise<LocalAuthentication.LocalAuthenticationResult>(
          (resolve) => {
            resolveAuth = resolve;
          }
        )
    );

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.isLocked).toBe(true);
    });

    let concurrentUnlock = true;
    await act(async () => {
      concurrentUnlock = await result.current.unlock();
    });
    expect(concurrentUnlock).toBe(false);

    resolveAuth({ success: false, error: "not_available" });

    await waitFor(() => {
      expect(result.current.isLocked).toBe(false);
      expect(result.current.isEnabled).toBe(false);
      expect(result.current.errorMessage).toBeNull();
    });
    await expect(Storage.getItemAsync("biometric_lock_enabled")).resolves.toBe(
      "false"
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "authentication_failed",
    });
    let unlockResult = true;
    await act(async () => {
      unlockResult = await result.current.unlock();
    });
    expect(unlockResult).toBe(false);
    expect(result.current.errorMessage).toBe(
      "Não foi possível validar sua biometria. Tente novamente."
    );
  });

  it("ignores mount resolution after unmount and throws outside provider", async () => {
    let resolveStored!: (value: string | null) => void;
    const getSpy = jest.spyOn(Storage, "getItemAsync").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStored = resolve;
      })
    );

    const { unmount } = await renderHook(() => useAppLock(), { wrapper });
    await unmount();

    resolveStored("true");
    await Promise.resolve();

    getSpy.mockRestore();

    await expect(renderHook(() => useAppLock())).rejects.toThrow(
      "useAppLock precisa estar dentro de AppLockProvider"
    );
  });

  it("prevents concurrent enable and disable calls", async () => {
    let resolveAuth!: (
      value: LocalAuthentication.LocalAuthenticationResult
    ) => void;
    mockAuthenticate.mockImplementation(
      () =>
        new Promise<LocalAuthentication.LocalAuthenticationResult>(
          (resolve) => {
            resolveAuth = resolve;
          }
        )
    );

    const { result } = await renderHook(() => useAppLock(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAvailable).toBe(true);
    });

    let enablePromise!: Promise<boolean>;
    let concurrentEnable = true;

    await act(async () => {
      enablePromise = result.current.enable();
      concurrentEnable = await result.current.enable();
    });

    expect(concurrentEnable).toBe(false);

    resolveAuth({ success: true });
    await act(async () => {
      await expect(enablePromise).resolves.toBe(true);
    });

    let disablePromise!: Promise<boolean>;
    let concurrentDisable = true;

    await act(async () => {
      disablePromise = result.current.disable();
      concurrentDisable = await result.current.disable();
    });

    expect(concurrentDisable).toBe(false);

    resolveAuth({ success: true });
    await act(async () => {
      await expect(disablePromise).resolves.toBe(true);
    });
  });
});
