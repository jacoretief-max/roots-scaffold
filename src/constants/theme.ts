// Roots Design System — direct from spec §6
// All colours, typography, and spacing in one place.

export const Colors = {
  // Backgrounds
  background: '#F7F0E6',
  card: '#FFFCF7',
  tan: '#EAE0D0',

  // Primary
  terracotta: '#C45A3A',
  terracottaDark: '#9A3A22',

  // Accents
  sage: '#4A7A52',

  // Text
  textDark: '#2A1A10',
  textLight: '#8A6A58',

  // Globe (separate palette)
  globeBackground: '#0F1F2E',
  globeOcean: '#0d2b5e',
  globeLand: '#2d6b2a',

  // Status dots
  statusAvailable: '#4A7A52',   // sage green
  statusBusy: '#C45A3A',        // terracotta
  statusSleeping: '#85B7EB',    // soft blue

  // Score bars
  scoreHealthy: '#4A7A52',
  scoreMedium: '#C45A3A',
  scoreLow: '#E24B4A',

  // Utility
  white: '#FFFFFF',
  overlay: 'rgba(42, 26, 16, 0.45)',
} as const;

export const Typography = {
  // Primary font: Georgia (serif) — warm, analogue, trustworthy
  fontFamily: 'Georgia',

  // Sizes
  label: 10,       // section labels — ALL CAPS
  body: 14,        // body text
  heading: {
    sm: 18,
    md: 20,
    lg: 22,
  },
  nav: 9,          // bottom nav labels

  // Line heights
  lineHeightBody: 1.6,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const Shadows = {
  card: {
    shadowColor: Colors.textDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  fab: {
    shadowColor: '#8B3A1A',  // copper tone
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// Dunbar layer definitions
export const DunbarLayers = [
  { key: 'intimate',    limit: 5,   label: 'Intimate',   description: "The 5 people you'd call at 3am" },
  { key: 'close',       limit: 15,  label: 'Close',      description: 'Your trusted inner circle' },
  { key: 'active',      limit: 50,  label: 'Active',     description: 'Regular meaningful contact' },
  { key: 'meaningful',  limit: 150, label: 'Meaningful', description: 'Your broader community' },
] as const;

// Visibility levels
export const VisibilityLevels = [
  { key: 'onlyUs',       label: 'Only us',           description: 'Tagged people only' },
  { key: 'intimate',     label: 'Intimate',           description: 'Tagged + your 5' },
  { key: 'close',        label: 'Close',              description: 'Tagged + your 15' },
  { key: 'active',       label: 'Active',             description: 'Tagged + your 50' },
  { key: 'meaningful',   label: 'Everyone meaningful', description: 'Your full network' },
] as const;
