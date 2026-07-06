import { extendTheme, type ThemeConfig } from '@chakra-ui/react'

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
}

const theme = extendTheme({
  config,
  colors: {
    paper: {
      50: '#fffdf6',
      100: '#f7f1e6',
      200: '#eadfce',
      300: '#d9c9b0',
    },
    ink: {
      50: '#f7f7f3',
      100: '#ece9df',
      200: '#d7d0bf',
      300: '#bcb19c',
      400: '#8f8470',
      500: '#6f675a',
      600: '#575149',
      700: '#3b3a35',
      800: '#2c2d2a',
      900: '#1b1d1a',
    },
    cinnabar: {
      50: '#fff3ee',
      100: '#f7d8cc',
      200: '#e7b2a4',
      300: '#cf8677',
      400: '#b76150',
      500: '#9f4635',
      600: '#813527',
      700: '#64271d',
      800: '#481c15',
      900: '#2e120e',
    },
    bamboo: {
      50: '#f5f7ef',
      100: '#e6ecd7',
      200: '#cad6b1',
      300: '#a5b882',
      400: '#7f965d',
      500: '#5f7545',
      600: '#4b5d38',
      700: '#39472d',
      800: '#293322',
      900: '#1b2217',
    },
  },
  fonts: {
    heading:
      "'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', serif",
    body:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
  },
  radii: {
    md: '6px',
    lg: '8px',
    xl: '8px',
  },
  shadows: {
    inkPanel: '0 18px 50px rgba(55, 48, 38, 0.08)',
    inkSheet: '0 10px 28px rgba(55, 48, 38, 0.10)',
    inkLine: 'inset 0 0 0 1px rgba(59, 58, 53, 0.08)',
  },
  styles: {
    global: {
      body: {
        bg: 'paper.100',
        color: 'ink.900',
        letterSpacing: 0,
      },
      '*::selection': {
        bg: 'cinnabar.100',
      },
      '::-webkit-scrollbar': {
        width: '10px',
        height: '10px',
      },
      '::-webkit-scrollbar-thumb': {
        bg: 'ink.300',
        borderRadius: '999px',
        border: '2px solid',
        borderColor: 'paper.100',
      },
      '::-webkit-scrollbar-track': {
        bg: 'transparent',
      },
    },
  },
  components: {
    Alert: {
      baseStyle: {
        container: {
          borderRadius: '8px',
          border: '1px solid',
          borderColor: 'ink.200',
          bg: 'rgba(255, 252, 244, 0.82)',
          color: 'ink.800',
          boxShadow: 'inkLine',
          '&[data-status="info"]': {
            borderColor: 'ink.300',
          },
          '&[data-status="success"]': {
            borderColor: 'bamboo.300',
          },
          '&[data-status="warning"]': {
            borderColor: 'cinnabar.300',
          },
        },
        icon: {
          color: 'cinnabar.500',
        },
      },
    },
    Badge: {
      baseStyle: {
        borderRadius: '4px',
        fontWeight: '600',
        letterSpacing: 0,
      },
    },
    Button: {
      baseStyle: {
        borderRadius: '6px',
        fontWeight: '600',
        letterSpacing: 0,
        _focusVisible: {
          boxShadow: '0 0 0 3px rgba(159, 70, 53, 0.24)',
        },
      },
      variants: {
        outline: {
          borderColor: 'ink.300',
          color: 'ink.800',
          bg: 'rgba(255, 252, 244, 0.52)',
          _hover: { bg: 'paper.50' },
        },
        ghost: {
          color: 'ink.700',
          _hover: { bg: 'ink.100' },
        },
      },
      defaultProps: {
        variant: 'solid',
        colorScheme: 'ink',
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'rgba(255, 252, 244, 0.88)',
          borderWidth: '1px',
          borderColor: 'ink.200',
          borderRadius: '6px',
          boxShadow: 'inkSheet',
          overflow: 'hidden',
        },
        header: {
          pb: 2,
          borderBottom: '1px solid',
          borderColor: 'ink.100',
        },
        body: {
          pt: 4,
        },
      },
    },
    Input: {
      variants: {
        outline: {
          field: {
            bg: 'rgba(255, 252, 244, 0.82)',
            borderColor: 'ink.300',
            borderRadius: '6px',
            _hover: { borderColor: 'ink.400' },
            _focusVisible: {
              borderColor: 'cinnabar.500',
              boxShadow: '0 0 0 1px #9f4635',
            },
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          bg: 'paper.50',
          borderRadius: '8px',
          border: '1px solid',
          borderColor: 'ink.200',
          boxShadow: '0 24px 70px rgba(27, 29, 26, 0.24)',
        },
      },
    },
    Progress: {
      baseStyle: {
        track: {
          bg: 'ink.100',
          borderRadius: '999px',
        },
        filledTrack: {
          bg: 'cinnabar.500',
        },
      },
    },
    Stat: {
      baseStyle: {
        label: {
          color: 'ink.500',
          fontSize: 'sm',
        },
        number: {
          color: 'ink.900',
          fontFamily:
            "'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', serif",
        },
      },
    },
    Select: {
      variants: {
        outline: {
          field: {
            bg: 'rgba(255, 252, 244, 0.82)',
            borderColor: 'ink.300',
            borderRadius: '6px',
            _hover: { borderColor: 'ink.400' },
            _focusVisible: {
              borderColor: 'cinnabar.500',
              boxShadow: '0 0 0 1px #9f4635',
            },
          },
        },
      },
    },
    Tabs: {
      baseStyle: {
        tablist: {
          borderColor: 'ink.200',
        },
        tab: {
          color: 'ink.600',
          fontWeight: '600',
          _selected: {
            color: 'cinnabar.600',
            borderColor: 'cinnabar.500',
          },
        },
      },
    },
    Textarea: {
      variants: {
        outline: {
          bg: 'rgba(255, 252, 244, 0.82)',
          borderColor: 'ink.300',
          borderRadius: '6px',
          _hover: { borderColor: 'ink.400' },
          _focusVisible: {
            borderColor: 'cinnabar.500',
            boxShadow: '0 0 0 1px #9f4635',
          },
        },
      },
    },
  },
})

export default theme
