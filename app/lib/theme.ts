// A game table at night, with paper slips on it. Every name is set in the same
// typeface on the same slip, which is the point: no handwriting to recognize.
// Text meets WCAG AA contrast (white on marker is 4.6:1), and `edge` outlines
// controls at 3:1 against the table.

export const colors = {
  table: "#211C36",
  tableRaised: "#2C2648",
  line: "#433B68",
  edge: "#7A71A6",
  paper: "#FFF4D6",
  ink: "#1E1A2E",
  marker: "#DC3036",
  felt: "#6CCB8B",
  dusk: "#A49FC2",
} as const;

export const fonts = {
  regular: "BricolageGrotesque_400Regular",
  semibold: "BricolageGrotesque_600SemiBold",
  heavy: "BricolageGrotesque_800ExtraBold",
} as const;

export const type = {
  display: {
    fontFamily: fonts.heavy,
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: -1,
  },
  title: {
    fontFamily: fonts.heavy,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  strong: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;
