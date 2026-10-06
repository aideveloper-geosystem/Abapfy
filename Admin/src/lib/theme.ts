'use client'

import { createTheme } from '@mui/material/styles'

// Mesma paleta do app desktop (src/renderer/src/styles/theme.css, tema
// "Linear" — o padrão) e da mesma análise em DESIGN.md, adaptada pros
// componentes MUI em vez de custom properties CSS. Sem tema claro: o
// dashboard é sempre escuro, igual o app principal.
const colors = {
  primary: '#5e6ad2',
  onPrimary: '#ffffff',
  primaryHover: '#828fff',
  ink: '#f7f8f8',
  inkMuted: '#d0d6e0',
  inkSubtle: '#8a8f98',
  inkTertiary: '#62666d',
  canvas: '#141414',
  surface1: '#181818',
  surface2: '#1e1e1e',
  surface3: '#242424',
  hairline: '#2a2a2a',
  hairlineStrong: '#34343a',
  success: '#27a644',
  danger: '#e5484d',
  warning: '#d29922'
}

const fontDisplay =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI Variable", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
const fontText =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif'
const fontMono = '"SF Mono", "Cascadia Code", ui-monospace, Menlo, Consolas, monospace'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: colors.primary, contrastText: colors.onPrimary, light: colors.primaryHover },
    error: { main: colors.danger },
    success: { main: colors.success },
    warning: { main: colors.warning },
    background: { default: colors.canvas, paper: colors.surface1 },
    text: { primary: colors.ink, secondary: colors.inkSubtle, disabled: colors.inkTertiary },
    divider: colors.hairline
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: fontText,
    h1: { fontFamily: fontDisplay, fontWeight: 600, letterSpacing: '-1.2px' },
    h2: { fontFamily: fontDisplay, fontWeight: 600, letterSpacing: '-0.8px' },
    h3: { fontFamily: fontDisplay, fontWeight: 600, letterSpacing: '-0.4px' },
    h4: { fontFamily: fontDisplay, fontWeight: 600, letterSpacing: '-0.3px' },
    h5: { fontFamily: fontDisplay, fontWeight: 600 },
    h6: { fontFamily: fontDisplay, fontWeight: 600 },
    button: { fontWeight: 500, textTransform: 'none' },
    caption: { color: colors.inkTertiary }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: colors.canvas, colorScheme: 'dark' },
        '::selection': { background: 'rgba(94,106,210,0.35)' }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${colors.hairline}`
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: colors.surface1,
          backgroundImage: 'none',
          border: `1px solid ${colors.hairline}`
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.surface1,
          backgroundImage: 'none',
          borderBottom: `1px solid ${colors.hairline}`,
          boxShadow: 'none'
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.surface1,
          backgroundImage: 'none',
          borderRight: `1px solid ${colors.hairline}`
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
        containedPrimary: {
          '&:hover': { backgroundColor: colors.primaryHover }
        }
      }
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } }
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: colors.hairline } }
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 8 } }
    }
  }
})

export const dashboardColors = colors
export const dashboardFonts = { display: fontDisplay, text: fontText, mono: fontMono }
