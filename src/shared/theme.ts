import { ColorSchemeName, StyleSheet, useColorScheme } from "react-native";
import {
  AppearancePreference,
  useAppearancePreference,
} from "../state/appearance";
import { ColorScheme, Palette, palettes } from "../theme/colors";

export type ThemedStyles<T> = Record<ColorScheme, T>;

export function resolveColorScheme(
  scheme: ColorSchemeName | null | undefined,
  preference: AppearancePreference = "system"
): ColorScheme {
  if (preference !== "system") {
    return preference;
  }

  return scheme === "dark" ? "dark" : "light";
}

export function useColorSchemeName(): ColorScheme {
  return resolveColorScheme(useColorScheme(), useAppearancePreference());
}

export function useColors(): Palette {
  return palettes[useColorSchemeName()];
}

export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  build: (palette: Palette) => T
): ThemedStyles<T> {
  return {
    light: StyleSheet.create(build(palettes.light)),
    dark: StyleSheet.create(build(palettes.dark)),
  };
}

export function useThemedStyles<T>(styles: ThemedStyles<T>): T {
  return styles[useColorSchemeName()];
}
