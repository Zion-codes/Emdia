import * as LocalAuthentication from "expo-local-authentication";

export type BiometricAuthResult =
  "authenticated" | "cancelled" | "unavailable" | "error";

export async function checkBiometricAvailability(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return false;
    }

    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(
  promptMessage: string
): Promise<BiometricAuthResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar senha do dispositivo",
      disableDeviceFallback: false,
    });

    if (result.success) {
      return "authenticated";
    }

    if (
      result.error === "user_cancel" ||
      result.error === "system_cancel" ||
      result.error === "app_cancel"
    ) {
      return "cancelled";
    }

    if (
      result.error === "not_available" ||
      result.error === "not_enrolled" ||
      result.error === "passcode_not_set"
    ) {
      return "unavailable";
    }

    return "error";
  } catch {
    return "error";
  }
}
