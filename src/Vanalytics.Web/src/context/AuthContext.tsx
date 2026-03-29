import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, storeTokens, clearTokens, getStoredTokens } from '../api/client'
import type { AuthResponse, UserProfile, LoginRequest } from '../types/api'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  login: (req: LoginRequest) => Promise<void>
  oauthLogin: (provider: string, code: string, redirectUri: string) => Promise<void>
  samlExchange: (code: string) => Promise<void>
  refreshUser: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { accessToken } = getStoredTokens()
    if (accessToken) {
      api<UserProfile>('/api/auth/me')
        .then(setUser)
        .catch(() => clearTokens())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (req: LoginRequest) => {
    const auth = await api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    storeTokens(auth.accessToken, auth.refreshToken)
    const profile = await api<UserProfile>('/api/auth/me')
    setUser(profile)
  }

  const oauthLogin = async (provider: string, code: string, redirectUri: string) => {
    const auth = await api<AuthResponse>(`/api/auth/oauth/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ code, redirectUri }),
    })
    storeTokens(auth.accessToken, auth.refreshToken)
    const profile = await api<UserProfile>('/api/auth/me')
    setUser(profile)
  }

  const samlExchange = async (code: string) => {
    const auth = await api<AuthResponse>('/api/auth/saml/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    storeTokens(auth.accessToken, auth.refreshToken)
    const profile = await api<UserProfile>('/api/auth/me')
    setUser(profile)
  }

  const refreshUser = async () => {
    try {
      const profile = await api<UserProfile>('/api/auth/me')
      setUser(profile)
    } catch {
      clearTokens()
      setUser(null)
    }
  }

  const logout = () => {
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, oauthLogin, samlExchange, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
