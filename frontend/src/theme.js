import { alpha, createTheme } from '@mui/material/styles';

const shadows = {
  light: '0 16px 40px rgba(15, 23, 42, 0.07)',
  dark: '0 18px 48px rgba(0, 0, 0, 0.28)',
};

const createAppTheme = (mode = 'light') => {
  const dark = mode === 'dark';
  const background = dark
    ? { default: '#080c14', paper: '#111827' }
    : { default: '#f4f7fb', paper: '#ffffff' };

  return createTheme({
    palette: {
      mode,
      primary: { main: '#0ea5e9', dark: '#0284c7', light: '#38bdf8', contrastText: '#ffffff' },
      secondary: { main: '#8b5cf6' },
      success: { main: '#10b981' },
      warning: { main: '#f59e0b' },
      error: { main: '#ef4444' },
      background,
      divider: dark ? alpha('#94a3b8', 0.18) : '#e5eaf1',
      text: dark
        ? { primary: '#f1f5f9', secondary: '#94a3b8' }
        : { primary: '#172033', secondary: '#64748b' },
      surface: {
        soft: dark ? '#151e2e' : '#f8fafc',
        raised: dark ? '#172033' : '#ffffff',
        sidebar: dark ? '#080d18' : '#0f172a',
      },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h1: { fontWeight: 850, letterSpacing: '-0.04em' },
      h2: { fontWeight: 850, letterSpacing: '-0.035em' },
      h3: { fontWeight: 800, letterSpacing: '-0.03em' },
      h4: { fontWeight: 800, letterSpacing: '-0.025em' },
      h5: { fontWeight: 780, letterSpacing: '-0.02em' },
      h6: { fontWeight: 750, letterSpacing: '-0.015em' },
      button: { textTransform: 'none', fontWeight: 700, letterSpacing: '-0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'html, body, #root': { minHeight: '100%', margin: 0 },
          body: { backgroundColor: background.default },
          '*': {
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            scrollbarColor: `${dark ? alpha('#94a3b8', 0.42) : alpha('#64748b', 0.34)} transparent`,
          },
          '*::-webkit-scrollbar': { width: 9, height: 9 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: dark ? alpha('#94a3b8', 0.34) : alpha('#64748b', 0.28),
            border: '2px solid transparent',
            backgroundClip: 'padding-box',
            borderRadius: 999,
          },
          '*::-webkit-scrollbar-thumb:hover': { backgroundColor: dark ? alpha('#94a3b8', 0.52) : alpha('#64748b', 0.44) },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10, minHeight: 38, paddingInline: 16 },
          sizeLarge: { minHeight: 46, borderRadius: 12 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: 16 },
          elevation1: { boxShadow: shadows[mode], border: `1px solid ${dark ? alpha('#94a3b8', 0.14) : '#e8edf3'}` },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { backgroundImage: 'none', border: `1px solid ${dark ? alpha('#94a3b8', 0.16) : '#e7ecf2'}`, boxShadow: 'none' },
        },
      },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 11, backgroundColor: dark ? alpha('#020617', 0.18) : alpha('#ffffff', 0.72) },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 700 } } },
      MuiDialog: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
};

export default createAppTheme;
