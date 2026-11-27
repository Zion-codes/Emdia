import { fireEvent, render, screen } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";
import { useAppLock } from "../../state/appLock";
import { LockScreen } from "./LockScreen";

jest.mock("../../state/appLock", () => ({
  useAppLock: jest.fn(),
}));

const mockUseAppLock = jest.mocked(useAppLock);

describe("LockScreen", () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOs,
    });
  });

  it("renders hidden modal when unlocked", async () => {
    mockUseAppLock.mockReturnValue({
      isInitialized: true,
      isEnabled: false,
      isAvailable: true,
      isLocked: false,
      isAuthenticating: false,
      errorMessage: null,
      enable: jest.fn(),
      disable: jest.fn(),
      unlock: jest.fn(),
    });

    await render(<LockScreen />);
    expect(screen.queryByTestId("lock-screen")).toBeNull();
  });

  it("renders native modal overlay, blocks Android back button, and triggers unlock", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    let backCallback:
      Parameters<typeof BackHandler.addEventListener>[1] | null = null;
    const addSpy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_eventName, callback) => {
        backCallback = callback;
        return { remove: jest.fn() };
      });

    const unlock = jest.fn().mockResolvedValue(true);
    mockUseAppLock.mockReturnValue({
      isInitialized: true,
      isEnabled: true,
      isAvailable: true,
      isLocked: true,
      isAuthenticating: false,
      errorMessage: "Autenticação cancelada.",
      enable: jest.fn(),
      disable: jest.fn(),
      unlock,
    });

    await render(<LockScreen />);

    expect(screen.getByTestId("lock-screen-modal")).toBeTruthy();
    expect(screen.getByTestId("lock-screen")).toBeTruthy();
    expect(screen.getByText("Em Dia bloqueado")).toBeTruthy();
    expect(screen.getByTestId("lock-screen-error")).toBeTruthy();
    expect(backCallback).not.toBeNull();
    expect(backCallback!({} as never)).toBe(true);

    await fireEvent(screen.getByTestId("lock-screen-modal"), "requestClose");
    expect(screen.getByTestId("lock-screen")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("lock-screen-unlock-button"));
    expect(unlock).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  it("disables unlock button while authenticating", async () => {
    const unlock = jest.fn().mockResolvedValue(true);
    mockUseAppLock.mockReturnValue({
      isInitialized: true,
      isEnabled: true,
      isAvailable: true,
      isLocked: true,
      isAuthenticating: true,
      errorMessage: null,
      enable: jest.fn(),
      disable: jest.fn(),
      unlock,
    });

    await render(<LockScreen />);

    expect(screen.getByText("Validando...")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("lock-screen-unlock-button"));
    expect(unlock).not.toHaveBeenCalled();
  });
});
