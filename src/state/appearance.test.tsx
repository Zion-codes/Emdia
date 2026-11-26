import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { type JSX } from "react";
import { Text } from "react-native";
import { setStored } from "../shared/storage";
import {
  AppearanceProvider,
  useAppearance,
  useAppearancePreference,
} from "./appearance";

function Consumer(): JSX.Element {
  const { preference, setPreference } = useAppearance();
  const current = useAppearancePreference();

  return (
    <Text testID="pref" onPress={() => setPreference("dark")}>
      {`${preference}:${current}`}
    </Text>
  );
}

describe("AppearanceProvider", () => {
  it("loads stored preference and updates it", async () => {
    await setStored("appearance", "light");

    await render(
      <AppearanceProvider>
        <Consumer />
      </AppearanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("pref").props.children).toBe("light:light");
    });

    await act(async () => {
      screen.getByTestId("pref").props.onPress();
    });

    expect(screen.getByTestId("pref").props.children).toBe("dark:dark");
  });

  it("falls back to system for invalid stored values", async () => {
    await setStored("appearance", "invalid");

    await render(
      <AppearanceProvider>
        <Consumer />
      </AppearanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("pref").props.children).toBe("system:system");
    });
  });

  it("throws when useAppearance is used outside provider", async () => {
    await expect(renderHook(() => useAppearance())).rejects.toThrow(
      "useAppearance precisa estar dentro de AppearanceProvider"
    );

    const { result } = await renderHook(() => useAppearancePreference());
    expect(result.current).toBe("system");
  });
});
