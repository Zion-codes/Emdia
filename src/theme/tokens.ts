export const fontFamily = {
  text: undefined as string | undefined,
  mono: "monospace",
} as const;

export const radii = {
  controlSm: 12,
  control: 14,
  button: 16,
  sheet: 24,
  modal: 28,
  pill: 999,
} as const;

export const spacing = {
  s4: 4,
  s6: 6,
  s10: 10,
  s12: 12,
  s16: 16,
  s20: 20,
} as const;

export const typography = {
  headline: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  button: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  tabLabel: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
} as const;

export const opacity = {
  pressed: 0.85,
  disabled: 0.5,
} as const;

export const controlHeight = {
  button: 54,
  dialogButton: 46,
  input: 50,
  inputFloating: 54,
  target: 44,
} as const;

export const motion = {
  base: 180,
} as const;
