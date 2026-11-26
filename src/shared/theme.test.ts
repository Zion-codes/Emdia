import { renderHook } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import {
  createThemedStyles,
  resolveColorScheme,
  useColors,
  useColorSchemeName,
  useThemedStyles,
} from "./theme";
import { palettes } from "../theme/colors";

describe("theme helpers", () => {
  it("resolves color scheme from system or explicit preference", () => {
    expect(resolveColorScheme("dark")).toBe("dark");
    expect(resolveColorScheme("light")).toBe("light");
    expect(resolveColorScheme(null)).toBe("light");
    expect(resolveColorScheme("dark", "light")).toBe("light");
    expect(resolveColorScheme("light", "dark")).toBe("dark");
  });

  it("returns active palette and themed styles", async () => {
    const spy = jest
      .spyOn(ReactNative, "useColorScheme")
      .mockReturnValue("dark");

    const themed = createThemedStyles((colors) => ({
      box: { backgroundColor: colors.background },
    }));

    const { result } = await renderHook(() => ({
      scheme: useColorSchemeName(),
      colors: useColors(),
      styles: useThemedStyles(themed),
    }));

    expect(result.current.scheme).toBe("dark");
    expect(result.current.colors).toEqual(palettes.dark);
    expect(result.current.styles.box.backgroundColor).toBe(
      palettes.dark.background
    );

    spy.mockRestore();
  });
});
