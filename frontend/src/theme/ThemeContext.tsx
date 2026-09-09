import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type UiTheme = 'classic' | 'colorful'

export type TableHeaderStyle = {
  bg: string
  color: string
  fontSize: string
}

export type SidebarStyle = {
  bg: string
  color: string
}

/** Primary action button (non-ghost) */
export type PrimaryButtonStyle = {
  name: string
  gradientFrom: string
  gradientTo: string
  text: string
  hoverFrom: string
  hoverTo: string
}

type ThemeContextValue = {
  theme: UiTheme
  setTheme: (theme: UiTheme) => void
  tableHeader: TableHeaderStyle
  setTableHeader: (next: Partial<TableHeaderStyle>) => void
  resetTableHeader: () => void
  sidebar: SidebarStyle
  setSidebar: (next: Partial<SidebarStyle>) => void
  resetSidebar: () => void
  primaryButton: PrimaryButtonStyle
  setPrimaryButton: (next: Partial<PrimaryButtonStyle>) => void
  resetPrimaryButton: () => void
}

const THEME_KEY = 'gbl.uiTheme'
const TABLE_HEADER_KEY = 'gbl.tableHeader'
const SIDEBAR_KEY = 'gbl.sidebarStyle'
const PRIMARY_BUTTON_KEY = 'gbl.primaryButtonStyle'

const DEFAULT_TABLE_HEADER: TableHeaderStyle = {
  bg: '#1d4ed8',
  color: '#ffffff',
  fontSize: '13px',
}

const DEFAULT_SIDEBAR: SidebarStyle = {
  bg: '#0a1c31',
  color: '#f3efe6',
}

export const DEFAULT_PRIMARY_BUTTON: PrimaryButtonStyle = {
  name: 'Primary',
  gradientFrom: '#0f2744',
  gradientTo: '#1d4ed8',
  text: '#ffffff',
  hoverFrom: '#153556',
  hoverTo: '#2563eb',
}

const BUTTON_PRESETS: PrimaryButtonStyle[] = [
  DEFAULT_PRIMARY_BUTTON,
  {
    name: 'Teal',
    gradientFrom: '#0f766e',
    gradientTo: '#14b8a6',
    text: '#ffffff',
    hoverFrom: '#0d9488',
    hoverTo: '#2dd4bf',
  },
  {
    name: 'Emerald',
    gradientFrom: '#047857',
    gradientTo: '#10b981',
    text: '#ffffff',
    hoverFrom: '#059669',
    hoverTo: '#34d399',
  },
  {
    name: 'Slate',
    gradientFrom: '#334155',
    gradientTo: '#64748b',
    text: '#ffffff',
    hoverFrom: '#475569',
    hoverTo: '#94a3b8',
  },
]

export { BUTTON_PRESETS }

const ThemeContext = createContext<ThemeContextValue | null>(null)

function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value, 'important')
}

function readStoredTheme(): UiTheme {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === 'classic' || raw === 'colorful') return raw
  } catch {
    /* ignore */
  }
  return 'colorful'
}

function readStoredTableHeader(): TableHeaderStyle {
  try {
    const raw = localStorage.getItem(TABLE_HEADER_KEY)
    if (!raw) return { ...DEFAULT_TABLE_HEADER }
    const parsed = JSON.parse(raw) as Partial<TableHeaderStyle>
    return {
      bg: typeof parsed.bg === 'string' ? parsed.bg : DEFAULT_TABLE_HEADER.bg,
      color:
        typeof parsed.color === 'string'
          ? parsed.color
          : DEFAULT_TABLE_HEADER.color,
      fontSize:
        typeof parsed.fontSize === 'string'
          ? parsed.fontSize
          : DEFAULT_TABLE_HEADER.fontSize,
    }
  } catch {
    return { ...DEFAULT_TABLE_HEADER }
  }
}

function readStoredSidebar(): SidebarStyle {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    if (!raw) return { ...DEFAULT_SIDEBAR }
    const parsed = JSON.parse(raw) as Partial<SidebarStyle>
    return {
      bg: typeof parsed.bg === 'string' ? parsed.bg : DEFAULT_SIDEBAR.bg,
      color:
        typeof parsed.color === 'string' ? parsed.color : DEFAULT_SIDEBAR.color,
    }
  } catch {
    return { ...DEFAULT_SIDEBAR }
  }
}

function readStoredPrimaryButton(): PrimaryButtonStyle {
  try {
    const raw = localStorage.getItem(PRIMARY_BUTTON_KEY)
    if (!raw) return { ...DEFAULT_PRIMARY_BUTTON }
    const parsed = JSON.parse(raw) as Partial<PrimaryButtonStyle>
    return {
      name:
        typeof parsed.name === 'string'
          ? parsed.name
          : DEFAULT_PRIMARY_BUTTON.name,
      gradientFrom:
        typeof parsed.gradientFrom === 'string'
          ? parsed.gradientFrom
          : DEFAULT_PRIMARY_BUTTON.gradientFrom,
      gradientTo:
        typeof parsed.gradientTo === 'string'
          ? parsed.gradientTo
          : DEFAULT_PRIMARY_BUTTON.gradientTo,
      text:
        typeof parsed.text === 'string'
          ? parsed.text
          : DEFAULT_PRIMARY_BUTTON.text,
      hoverFrom:
        typeof parsed.hoverFrom === 'string'
          ? parsed.hoverFrom
          : DEFAULT_PRIMARY_BUTTON.hoverFrom,
      hoverTo:
        typeof parsed.hoverTo === 'string'
          ? parsed.hoverTo
          : DEFAULT_PRIMARY_BUTTON.hoverTo,
    }
  } catch {
    return { ...DEFAULT_PRIMARY_BUTTON }
  }
}

function applyTheme(theme: UiTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyTableHeader(style: TableHeaderStyle) {
  setCssVar('--theme-table-head-bg', style.bg)
  setCssVar('--theme-table-head-color', style.color)
  setCssVar('--theme-table-head-size', style.fontSize)
}

function applySidebar(style: SidebarStyle) {
  setCssVar('--theme-sidebar-bg', style.bg)
  setCssVar('--theme-sidebar-color', style.color)
}

function applyPrimaryButton(style: PrimaryButtonStyle) {
  setCssVar('--theme-btn-from', style.gradientFrom)
  setCssVar('--theme-btn-to', style.gradientTo)
  setCssVar('--theme-btn-text', style.text)
  setCssVar('--theme-btn-hover-from', style.hoverFrom)
  setCssVar('--theme-btn-hover-to', style.hoverTo)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(() => {
    const initial = readStoredTheme()
    if (typeof document !== 'undefined') applyTheme(initial)
    return initial
  })

  const [tableHeader, setTableHeaderState] = useState<TableHeaderStyle>(() => {
    const initial = readStoredTableHeader()
    if (typeof document !== 'undefined') applyTableHeader(initial)
    return initial
  })

  const [sidebar, setSidebarState] = useState<SidebarStyle>(() => {
    const initial = readStoredSidebar()
    if (typeof document !== 'undefined') applySidebar(initial)
    return initial
  })

  const [primaryButton, setPrimaryButtonState] = useState<PrimaryButtonStyle>(
    () => {
      const initial = readStoredPrimaryButton()
      if (typeof document !== 'undefined') applyPrimaryButton(initial)
      return initial
    },
  )

  useEffect(() => {
    applyTheme(theme)
    // Re-apply custom colors after theme attribute so they always win.
    applySidebar(sidebar)
    applyTableHeader(tableHeader)
    applyPrimaryButton(primaryButton)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme, sidebar, tableHeader, primaryButton])

  useEffect(() => {
    applyTableHeader(tableHeader)
    try {
      localStorage.setItem(TABLE_HEADER_KEY, JSON.stringify(tableHeader))
    } catch {
      /* ignore */
    }
  }, [tableHeader])

  useEffect(() => {
    applySidebar(sidebar)
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebar))
    } catch {
      /* ignore */
    }
  }, [sidebar])

  useEffect(() => {
    applyPrimaryButton(primaryButton)
    try {
      localStorage.setItem(PRIMARY_BUTTON_KEY, JSON.stringify(primaryButton))
    } catch {
      /* ignore */
    }
  }, [primaryButton])

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next)
  }, [])

  const setTableHeader = useCallback((next: Partial<TableHeaderStyle>) => {
    setTableHeaderState((current) => ({ ...current, ...next }))
  }, [])

  const resetTableHeader = useCallback(() => {
    setTableHeaderState({ ...DEFAULT_TABLE_HEADER })
  }, [])

  const setSidebar = useCallback((next: Partial<SidebarStyle>) => {
    setSidebarState((current) => ({ ...current, ...next }))
  }, [])

  const resetSidebar = useCallback(() => {
    setSidebarState({ ...DEFAULT_SIDEBAR })
  }, [])

  const setPrimaryButton = useCallback((next: Partial<PrimaryButtonStyle>) => {
    setPrimaryButtonState((current) => ({ ...current, ...next }))
  }, [])

  const resetPrimaryButton = useCallback(() => {
    setPrimaryButtonState({ ...DEFAULT_PRIMARY_BUTTON })
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      tableHeader,
      setTableHeader,
      resetTableHeader,
      sidebar,
      setSidebar,
      resetSidebar,
      primaryButton,
      setPrimaryButton,
      resetPrimaryButton,
    }),
    [
      theme,
      setTheme,
      tableHeader,
      setTableHeader,
      resetTableHeader,
      sidebar,
      setSidebar,
      resetSidebar,
      primaryButton,
      setPrimaryButton,
      resetPrimaryButton,
    ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
