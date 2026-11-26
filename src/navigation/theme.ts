import { DarkTheme, DefaultTheme, Theme } from "@react-navigation/native";
import { ColorScheme, palettes } from "../theme/colors";

function buildNavigationTheme(scheme: ColorScheme): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const palette = palettes[scheme];

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
    },
  };
}

export const navigationThemes: Record<ColorScheme, Theme> = {
  light: buildNavigationTheme("light"),
  dark: buildNavigationTheme("dark"),
};
