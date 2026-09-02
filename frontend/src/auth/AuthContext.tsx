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
  signup: (input: {
    email: string
    password: string
    firstName: string
    lastName: string
  }) => Promise<void>
  logout: () => Promise<void>
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

  const signup = useCallback(
    async (input: {
      email: string
      password: string
      firstName: string
      lastName: string
    }) => {
      setError(null)
      const result = await api.signup(input)
      setAccessToken(result.tokens.accessToken)
      setUser(result.user)
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, signup, logout }),
    [user, loading, error, login, signup, logout],
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
