import * as LocalAuthentication from "expo-local-authentication";
import {
  authenticateWithBiometrics,
  checkBiometricAvailability,
} from "./biometrics";

const mockHasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const mockIsEnrolled = jest.mocked(LocalAuthentication.isEnrolledAsync);
const mockAuthenticate = jest.mocked(LocalAuthentication.authenticateAsync);

describe("biometrics", () => {
  beforeEach(() => {
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(true);
    mockAuthenticate.mockResolvedValue({ success: true });
  });

  it("checks hardware and enrollment availability", async () => {
    await expect(checkBiometricAvailability()).resolves.toBe(true);

    mockHasHardware.mockResolvedValueOnce(false);
    await expect(checkBiometricAvailability()).resolves.toBe(false);

    mockIsEnrolled.mockResolvedValueOnce(false);
    await expect(checkBiometricAvailability()).resolves.toBe(false);

    mockHasHardware.mockRejectedValueOnce(new Error("hardware error"));
    await expect(checkBiometricAvailability()).resolves.toBe(false);
  });

  it("returns authenticated when biometric succeeds", async () => {
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "authenticated"
    );

    expect(mockAuthenticate).toHaveBeenCalledWith({
      promptMessage: "Desbloquear",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar senha do dispositivo",
      disableDeviceFallback: false,
    });
  });

  it("returns unavailable when native authentication reports unavailable or passcode not set", async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "not_available",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "unavailable"
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "not_enrolled",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "unavailable"
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "passcode_not_set",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "unavailable"
    );
  });

  it("returns cancelled when user or system cancels", async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "cancelled"
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "system_cancel",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "cancelled"
    );

    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "app_cancel",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "cancelled"
    );
  });

  it("returns error on authentication failure or exception", async () => {
    mockAuthenticate.mockResolvedValueOnce({
      success: false,
      error: "authentication_failed",
    });
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "error"
    );

    mockAuthenticate.mockRejectedValueOnce(new Error("native crash"));
    await expect(authenticateWithBiometrics("Desbloquear")).resolves.toBe(
      "error"
    );
  });
});
