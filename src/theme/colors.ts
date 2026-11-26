export type ColorScheme = "light" | "dark";

export type Palette = {
  background: string;
  surface: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryHover: string;
  accent: string;
  accentMuted: string;
  focusRing: string;
  success: string;
  successMuted: string;
  successSubtle: string;
  danger: string;
  dangerMuted: string;
  dangerSubtle: string;
  dangerOnPrimary: string;
  successOnPrimary: string;
  income: string;
  incomeMuted: string;
  expense: string;
  expenseMuted: string;
  warning: string;
  warningMuted: string;
  whatsapp: string;
  whatsappHover: string;
  male: string;
  maleMuted: string;
  female: string;
  femaleMuted: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  textOnPrimaryMuted: string;
  placeholder: string;
  footer: string;
  scrim: string;
  hoverOverlay: string;
  dividerOnPrimary: string;
  codeBackground: string;
};

export type ColorToken = keyof Palette;

const darkPalette: Palette = {
  background: "#05070D",
  surface: "#0B0F1A",
  border: "#1E293B",
  borderStrong: "#5F6B85",
  primary: "#1E3A8A",
  primaryHover: "#2545A0",
  accent: "#3B82F6",
  accentMuted: "rgba(59, 130, 246, 0.12)",
  focusRing: "#3B82F6",
  success: "#22C55E",
  successMuted: "rgba(34, 197, 94, 0.12)",
  successSubtle: "rgba(34, 197, 94, 0.18)",
  danger: "#EF4444",
  dangerMuted: "rgba(239, 68, 68, 0.12)",
  dangerSubtle: "rgba(239, 68, 68, 0.18)",
  dangerOnPrimary: "#FCA5A5",
  successOnPrimary: "#9EDDB4",
  income: "#5FBF86",
  incomeMuted: "rgba(95, 191, 134, 0.12)",
  expense: "#E07A7A",
  expenseMuted: "rgba(224, 122, 122, 0.12)",
  warning: "#EAB308",
  warningMuted: "rgba(234, 179, 8, 0.14)",
  whatsapp: "#15803D",
  whatsappHover: "#166534",
  male: "#3B82F6",
  maleMuted: "rgba(59, 130, 246, 0.12)",
  female: "#EC4899",
  femaleMuted: "rgba(236, 72, 153, 0.14)",
  text: "#FFFFFF",
  textMuted: "#A9AFBC",
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "rgba(255, 255, 255, 0.78)",
  placeholder: "#8A8F98",
  footer: "#7C8392",
  scrim: "rgba(0, 0, 0, 0.75)",
  hoverOverlay: "rgba(255, 255, 255, 0.04)",
  dividerOnPrimary: "rgba(255, 255, 255, 0.12)",
  codeBackground: "#FFFFFF",
};

const lightPalette: Palette = {
  background: "#F4F6FA",
  surface: "#FFFFFF",
  border: "#E1E6EF",
  borderStrong: "#7A8499",
  primary: "#1E3A8A",
  primaryHover: "#1A3279",
  accent: "#1D4ED8",
  accentMuted: "rgba(29, 78, 216, 0.10)",
  focusRing: "#1D4ED8",
  success: "#137333",
  successMuted: "rgba(19, 115, 51, 0.10)",
  successSubtle: "rgba(34, 197, 94, 0.18)",
  danger: "#B91C1C",
  dangerMuted: "rgba(185, 28, 28, 0.10)",
  dangerSubtle: "rgba(239, 68, 68, 0.18)",
  dangerOnPrimary: "#FCA5A5",
  successOnPrimary: "#9EDDB4",
  income: "#2D7A4F",
  incomeMuted: "rgba(45, 122, 79, 0.10)",
  expense: "#A94442",
  expenseMuted: "rgba(169, 68, 66, 0.10)",
  warning: "#A14A08",
  warningMuted: "rgba(161, 74, 8, 0.10)",
  whatsapp: "#15803D",
  whatsappHover: "#166534",
  male: "#1D4ED8",
  maleMuted: "rgba(29, 78, 216, 0.10)",
  female: "#C0246A",
  femaleMuted: "rgba(192, 36, 106, 0.10)",
  text: "#0B1220",
  textMuted: "#4A5468",
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "rgba(255, 255, 255, 0.78)",
  placeholder: "#626B80",
  footer: "#5B6478",
  scrim: "rgba(11, 18, 32, 0.5)",
  hoverOverlay: "rgba(11, 18, 32, 0.04)",
  dividerOnPrimary: "rgba(255, 255, 255, 0.12)",
  codeBackground: "#FFFFFF",
};

export const palettes: Record<ColorScheme, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

export const chartColors = {
  series: ["#3987E5", "#D95926", "#199E70", "#C98500", "#D55181"],
  other: "#5C6270",
} as const;

export const avatarPalette = [
  "#1E3A8A",
  "#3B82F6",
  "#0EA5E9",
  "#0F766E",
  "#14B8A6",
  "#22C55E",
  "#65A30D",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#E11D48",
  "#EC4899",
  "#A855F7",
  "#6366F1",
  "#78716C",
  "#334155",
] as const;
