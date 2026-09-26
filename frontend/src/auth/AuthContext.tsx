import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, setAccessToken } from '../api/client'
import type { PublicUser } from '../types/auth'

type AuthContextValue = {
  user: PublicUser | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Merge latest public user fields into the signed-in session. */
  applyUser: (next: PublicUser) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((profile) => {
        if (active) setUser(profile)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const result = await api.login({ email, password })
    setAccessToken(result.tokens.accessToken)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const applyUser = useCallback((next: PublicUser) => {
    setUser((current) => {
      if (!current || current.id !== next.id) return current
      return { ...current, ...next }
    })
  }, [])

  const refreshUser = useCallback(async () => {
    const profile = await api.me()
    setUser(profile)
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, logout, applyUser, refreshUser }),
    [user, loading, error, login, logout, applyUser, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
