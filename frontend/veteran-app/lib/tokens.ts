/**
 * Design tokens as JS constants, mirroring the CSS custom properties defined
 * in app/globals.css (Visual Design Plan, Sections 1-3). Use these only when
 * a value is needed outside Tailwind class names (e.g. inline SVG, canvas
 * drawing, meta theme-color) -- everywhere else, prefer the Tailwind
 * utilities (bg-accent, text-danger, etc.) so the "only AccentButton /
 * ComputedTag / StatusTag touch semantic colors" rule stays enforceable.
 */
export const colors = {
  background: "#FAF8F5",
  surface: "#FFFFFF",
  border: "#E4E1DA",
  textSecondary: "#6B6862",
  textPrimary: "#2B2A28",
  accentTint: "#E3EEEC",
  accent: "#2B6E63",
  success: "#4B7A4E",
  warning: "#B8862E",
  danger: "#B4483B",
  computed: "#6B6FA0",
} as const;

export const radius = {
  card: "12px",
  control: "8px",
} as const;

export const typography = {
  fontFamily: "'Public Sans', system-ui, sans-serif",
  baseSize: "17px",
  lineHeight: 1.65,
  weights: {
    regular: 400,
    medium: 500,
  },
} as const;
