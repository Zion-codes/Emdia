import { renderHook } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";
import { useAndroidBackHandler } from "./useAndroidBackHandler";

describe("useAndroidBackHandler", () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOs,
    });
  });

  it("registers and invokes hardwareBackPress listener on Android when enabled", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    const remove = jest.fn();
    let registeredCallback:
      Parameters<typeof BackHandler.addEventListener>[1] | null = null;
    const addSpy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_eventName, callback) => {
        registeredCallback = callback;
        return { remove };
      });

    const handler = jest.fn(() => true);
    const { unmount } = await renderHook(() =>
      useAndroidBackHandler(handler, true)
    );

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(registeredCallback).not.toBeNull();
    expect(registeredCallback!({} as never)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  it("uses enabled = true by default and does not register when disabled", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });

    const addSpy = jest.spyOn(BackHandler, "addEventListener");

    const { rerender } = await renderHook(
      ({ enabled }: { enabled?: boolean }) =>
        useAndroidBackHandler(() => false, enabled),
      { initialProps: { enabled: false } }
    );

    expect(addSpy).not.toHaveBeenCalled();

    await rerender({ enabled: undefined });
    expect(addSpy).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  it("does not register listener on non-Android platforms", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });

    const addSpy = jest.spyOn(BackHandler, "addEventListener");

    await renderHook(() => useAndroidBackHandler(() => true, true));

    expect(addSpy).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });
});
