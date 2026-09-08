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

type ThemeContextValue = {
  theme: UiTheme
  setTheme: (theme: UiTheme) => void
  tableHeader: TableHeaderStyle
  setTableHeader: (next: Partial<TableHeaderStyle>) => void
  resetTableHeader: () => void
  sidebar: SidebarStyle
  setSidebar: (next: Partial<SidebarStyle>) => void
  resetSidebar: () => void
}

const THEME_KEY = 'gbl.uiTheme'
const TABLE_HEADER_KEY = 'gbl.tableHeader'
const SIDEBAR_KEY = 'gbl.sidebarStyle'

const DEFAULT_TABLE_HEADER: TableHeaderStyle = {
  bg: '#1d4ed8',
  color: '#ffffff',
  fontSize: '13px',
}

const DEFAULT_SIDEBAR: SidebarStyle = {
  bg: '#0a1c31',
  color: '#f3efe6',
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

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

function applyTheme(theme: UiTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyTableHeader(style: TableHeaderStyle) {
  const root = document.documentElement
  root.style.setProperty('--theme-table-head-bg', style.bg)
  root.style.setProperty('--theme-table-head-color', style.color)
  root.style.setProperty('--theme-table-head-size', style.fontSize)
}

function applySidebar(style: SidebarStyle) {
  const root = document.documentElement
  root.style.setProperty('--theme-sidebar-bg', style.bg)
  root.style.setProperty('--theme-sidebar-color', style.color)
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

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

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
