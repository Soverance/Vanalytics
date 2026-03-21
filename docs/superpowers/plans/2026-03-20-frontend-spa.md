# Frontend SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/TypeScript SPA for Vanalytics with auth flow, character dashboard, public profiles, and API key management.

**Architecture:** Vite-powered React SPA with client-side routing. Auth state in React Context with JWT tokens stored in localStorage. API calls via a thin fetch wrapper that handles token refresh automatically. Vite dev server proxies `/api` to the backend.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS, React Router v7, React Context + fetch.

**Spec:** `docs/specs/2026-03-20-vanalytics-mvp-design.md` — Frontend section

**Builds on:** Plans 1-3 (backend API fully implemented)

---

## File Structure

```
src/Vanalytics.Web/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── api/
│   │   └── client.ts              # Fetch wrapper with JWT auth + refresh
│   ├── context/
│   │   └── AuthContext.tsx         # Auth state provider (login, register, logout, token mgmt)
│   ├── types/
│   │   └── api.ts                  # TypeScript interfaces matching backend DTOs
│   ├── components/
│   │   ├── Layout.tsx              # App shell (nav bar + content area)
│   │   ├── ProtectedRoute.tsx      # Redirects to /login if not authenticated
│   │   ├── CharacterCard.tsx       # Character summary card for dashboard list
│   │   ├── JobsGrid.tsx            # Job levels display grid
│   │   ├── GearTable.tsx           # Equipped gear table
│   │   └── CraftingTable.tsx       # Crafting skills table
│   └── pages/
│       ├── LandingPage.tsx         # / — marketing/landing
│       ├── LoginPage.tsx           # /login — login + register forms
│       ├── DashboardPage.tsx       # /dashboard — character list + management
│       ├── CharacterDetailPage.tsx # /dashboard/characters/:id — full character view
│       ├── ApiKeysPage.tsx         # /dashboard/keys — API key generate/revoke
│       └── PublicProfilePage.tsx   # /:server/:name — public character profile
```

---

### Task 1: Scaffold Vite + React + TypeScript + Tailwind Project

**Files:**
- Create: `src/Vanalytics.Web/` (entire project scaffold)

- [ ] **Step 1: Create the Vite project**

```bash
cd src
npm create vite@latest Vanalytics.Web -- --template react-ts
cd Vanalytics.Web
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind in vite.config.ts**

```typescript
// src/Vanalytics.Web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Set up Tailwind CSS entry point**

Replace `src/Vanalytics.Web/src/index.css` with:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Clean up default Vite boilerplate**

- Delete `src/App.css`
- Replace `src/App.tsx` with a minimal placeholder:

```tsx
// src/Vanalytics.Web/src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <h1 className="text-3xl font-bold p-8">Vanalytics</h1>
    </div>
  )
}
```

- [ ] **Step 6: Verify the dev server starts**

```bash
npm run dev
```

Expected: Dev server starts on port 3000 with Tailwind styles working.

---

### Task 2: TypeScript API Types

**Files:**
- Create: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Create TypeScript interfaces matching backend DTOs**

```typescript
// src/Vanalytics.Web/src/types/api.ts

// Auth
export interface RegisterRequest {
  email: string
  username: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

export interface UserProfile {
  id: string
  email: string
  username: string
  hasApiKey: boolean
  oAuthProvider: string | null
  createdAt: string
}

// Characters
export interface CharacterSummary {
  id: string
  name: string
  server: string
  licenseStatus: string
  isPublic: boolean
  lastSyncAt: string | null
}

export interface CharacterDetail {
  id: string
  name: string
  server: string
  licenseStatus: string
  isPublic: boolean
  lastSyncAt: string | null
  jobs: JobEntry[]
  gear: GearEntry[]
  craftingSkills: CraftingEntry[]
}

export interface JobEntry {
  job: string
  level: number
  isActive: boolean
}

export interface GearEntry {
  slot: string
  itemId: number
  itemName: string
}

export interface CraftingEntry {
  craft: string
  level: number
  rank: string
}

export interface CreateCharacterRequest {
  name: string
  server: string
}

export interface UpdateCharacterRequest {
  isPublic: boolean
}

// API Keys
export interface ApiKeyResponse {
  apiKey: string
  generatedAt: string
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 3: API Client with Auth Token Management

**Files:**
- Create: `src/Vanalytics.Web/src/api/client.ts`

- [ ] **Step 1: Create the API client**

A thin fetch wrapper that adds the JWT token to requests and handles 401 by attempting a token refresh.

```typescript
// src/Vanalytics.Web/src/api/client.ts

const TOKEN_KEY = 'vanalytics_access_token'
const REFRESH_KEY = 'vanalytics_refresh_token'

export function getStoredTokens() {
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  }
}

export function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getStoredTokens()
  if (!refreshToken) return null

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      clearTokens()
      return null
    }

    const data = await res.json()
    storeTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    clearTokens()
    return null
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = getStoredTokens()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(path, { ...options, headers })

  // If 401, try refreshing the token once
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      res = await fetch(path, { ...options, headers })
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new ApiError(res.status, error.message ?? 'Request failed')
  }

  if (res.status === 204) return undefined as T

  return res.json()
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 4: Auth Context and Protected Route

**Files:**
- Create: `src/Vanalytics.Web/src/context/AuthContext.tsx`
- Create: `src/Vanalytics.Web/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Create AuthContext**

```tsx
// src/Vanalytics.Web/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, storeTokens, clearTokens, getStoredTokens } from '../api/client'
import type { AuthResponse, UserProfile, RegisterRequest, LoginRequest } from '../types/api'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  login: (req: LoginRequest) => Promise<void>
  register: (req: RegisterRequest) => Promise<void>
  oauthLogin: (provider: string, code: string, redirectUri: string) => Promise<void>
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

  const register = async (req: RegisterRequest) => {
    const auth = await api<AuthResponse>('/api/auth/register', {
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

  const logout = () => {
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, oauthLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Create ProtectedRoute**

```tsx
// src/Vanalytics.Web/src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 5: Layout Component and App Router

**Files:**
- Create: `src/Vanalytics.Web/src/components/Layout.tsx`
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/main.tsx`
- Create: placeholder page files (minimal stubs)

- [ ] **Step 1: Create Layout**

```tsx
// src/Vanalytics.Web/src/components/Layout.tsx
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold text-blue-400">
            Vanalytics
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/dashboard" className="text-gray-300 hover:text-white">
                  Dashboard
                </Link>
                <Link to="/dashboard/keys" className="text-gray-300 hover:text-white">
                  API Keys
                </Link>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-white"
                >
                  Logout
                </button>
                <span className="text-sm text-gray-500">{user.username}</span>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create stub page files**

Create these minimal stubs (they'll be implemented in subsequent tasks):

```tsx
// src/Vanalytics.Web/src/pages/LandingPage.tsx
export default function LandingPage() {
  return <div>Landing</div>
}
```

```tsx
// src/Vanalytics.Web/src/pages/LoginPage.tsx
export default function LoginPage() {
  return <div>Login</div>
}
```

```tsx
// src/Vanalytics.Web/src/pages/DashboardPage.tsx
export default function DashboardPage() {
  return <div>Dashboard</div>
}
```

```tsx
// src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
export default function CharacterDetailPage() {
  return <div>Character Detail</div>
}
```

```tsx
// src/Vanalytics.Web/src/pages/ApiKeysPage.tsx
export default function ApiKeysPage() {
  return <div>API Keys</div>
}
```

```tsx
// src/Vanalytics.Web/src/pages/PublicProfilePage.tsx
export default function PublicProfilePage() {
  return <div>Public Profile</div>
}
```

- [ ] **Step 3: Wire up App.tsx with routes**

```tsx
// src/Vanalytics.Web/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import ApiKeysPage from './pages/ApiKeysPage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/characters/:id"
              element={
                <ProtectedRoute>
                  <CharacterDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/keys"
              element={
                <ProtectedRoute>
                  <ApiKeysPage />
                </ProtectedRoute>
              }
            />
            <Route path="/:server/:name" element={<PublicProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Update main.tsx**

```tsx
// src/Vanalytics.Web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 5: Verify build and dev server**

```bash
npm run build
npm run dev
```

---

### Task 6: Login / Register Page

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/LoginPage.tsx`

- [ ] **Step 1: Implement LoginPage with login and register forms**

```tsx
// src/Vanalytics.Web/src/pages/LoginPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'

// OAuth config — in production these come from environment variables
const OAUTH_CONFIG = {
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
  },
  microsoft: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    scope: 'openid email profile',
  },
}

export default function LoginPage() {
  const { user, login, register, oauthLogin } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const handleOAuth = (provider: 'google' | 'microsoft') => {
    const config = OAUTH_CONFIG[provider]
    const redirectUri = `${window.location.origin}/login`
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scope,
      state: provider,
    })
    window.location.href = `${config.authUrl}?${params}`
  }

  // Handle OAuth callback (code in URL query params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const provider = params.get('state') // We'll encode provider in state param
    if (code && provider) {
      const redirectUri = `${window.location.origin}/login`
      oauthLogin(provider, code, redirectUri)
        .then(() => navigate('/dashboard'))
        .catch((err) => {
          if (err instanceof ApiError) setError(err.message)
          else setError('OAuth login failed')
        })
      // Clean URL
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await register({ email, username, password })
      } else {
        await login({ email, password })
      }
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-8">
        <h2 className="mb-6 text-2xl font-bold">
          {isRegister ? 'Create Account' : 'Login'}
        </h2>

        {error && (
          <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-700 pt-4">
          <p className="text-center text-sm text-gray-500 mb-3">Or continue with</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleOAuth('google')}
              className="flex-1 rounded border border-gray-700 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Google
            </button>
            <button
              onClick={() => handleOAuth('microsoft')}
              className="flex-1 rounded border border-gray-700 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Microsoft
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="text-blue-400 hover:underline"
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 7: Dashboard Page — Character List

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/DashboardPage.tsx`
- Create: `src/Vanalytics.Web/src/components/CharacterCard.tsx`

- [ ] **Step 1: Create CharacterCard component**

```tsx
// src/Vanalytics.Web/src/components/CharacterCard.tsx
import { Link } from 'react-router-dom'
import type { CharacterSummary } from '../types/api'

interface Props {
  character: CharacterSummary
  onTogglePublic: (id: string, isPublic: boolean) => void
  onDelete: (id: string) => void
}

export default function CharacterCard({ character, onTogglePublic, onDelete }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between">
        <div>
          <Link
            to={`/dashboard/characters/${character.id}`}
            className="text-lg font-semibold text-blue-400 hover:underline"
          >
            {character.name}
          </Link>
          <p className="text-sm text-gray-400">{character.server}</p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            character.licenseStatus === 'Active'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-gray-800 text-gray-500'
          }`}
        >
          {character.licenseStatus}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-gray-400">
          <input
            type="checkbox"
            checked={character.isPublic}
            onChange={() => onTogglePublic(character.id, !character.isPublic)}
            className="rounded border-gray-600"
          />
          Public profile
        </label>

        {character.lastSyncAt && (
          <span className="text-gray-500">
            Synced {new Date(character.lastSyncAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {character.isPublic && (
          <Link
            to={`/${character.server}/${character.name}`}
            className="text-xs text-blue-400 hover:underline"
          >
            View public profile
          </Link>
        )}
        <button
          onClick={() => onDelete(character.id)}
          className="ml-auto text-xs text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement DashboardPage**

```tsx
// src/Vanalytics.Web/src/pages/DashboardPage.tsx
import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import type { CharacterSummary, CreateCharacterRequest } from '../types/api'
import CharacterCard from '../components/CharacterCard'

export default function DashboardPage() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [server, setServer] = useState('')
  const [error, setError] = useState('')

  const fetchCharacters = async () => {
    try {
      const data = await api<CharacterSummary[]>('/api/characters')
      setCharacters(data)
    } catch {
      setError('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCharacters() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api<CharacterSummary>('/api/characters', {
        method: 'POST',
        body: JSON.stringify({ name, server } as CreateCharacterRequest),
      })
      setName('')
      setServer('')
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    await api(`/api/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isPublic }),
    })
    fetchCharacters()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this character?')) return
    await api(`/api/characters/${id}`, { method: 'DELETE' })
    fetchCharacters()
  }

  if (loading) return <p className="text-gray-400">Loading characters...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-8 flex gap-3">
        <input
          type="text"
          placeholder="Character name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Server"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          required
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500"
        >
          Add Character
        </button>
      </form>

      {characters.length === 0 ? (
        <p className="text-gray-500">No characters registered yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              onTogglePublic={handleTogglePublic}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 8: Character Detail Page

> **Note:** The spec mentions "manually edit data that can't be automated through the addon." For MVP, the character detail page is read-only — data comes from addon sync. Manual editing UI will be added in a future iteration when specific non-syncable fields are identified.

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`
- Create: `src/Vanalytics.Web/src/components/JobsGrid.tsx`
- Create: `src/Vanalytics.Web/src/components/GearTable.tsx`
- Create: `src/Vanalytics.Web/src/components/CraftingTable.tsx`

- [ ] **Step 1: Create JobsGrid component**

```tsx
// src/Vanalytics.Web/src/components/JobsGrid.tsx
import type { JobEntry } from '../types/api'

export default function JobsGrid({ jobs }: { jobs: JobEntry[] }) {
  if (jobs.length === 0) return <p className="text-gray-500 text-sm">No job data.</p>

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
      {jobs.map((j) => (
        <div
          key={j.job}
          className={`rounded border px-2 py-1.5 text-center text-sm ${
            j.isActive
              ? 'border-blue-500 bg-blue-900/30 text-blue-300'
              : 'border-gray-700 bg-gray-800 text-gray-400'
          }`}
        >
          <div className="font-medium">{j.job}</div>
          <div className="text-xs">{j.level}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create GearTable component**

```tsx
// src/Vanalytics.Web/src/components/GearTable.tsx
import type { GearEntry } from '../types/api'

export default function GearTable({ gear }: { gear: GearEntry[] }) {
  if (gear.length === 0) return <p className="text-gray-500 text-sm">No gear data.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium">Slot</th>
          <th className="pb-2 font-medium">Item</th>
        </tr>
      </thead>
      <tbody>
        {gear.map((g) => (
          <tr key={g.slot} className="border-b border-gray-800">
            <td className="py-1.5 text-gray-400">{g.slot}</td>
            <td className="py-1.5">{g.itemName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 3: Create CraftingTable component**

```tsx
// src/Vanalytics.Web/src/components/CraftingTable.tsx
import type { CraftingEntry } from '../types/api'

export default function CraftingTable({ skills }: { skills: CraftingEntry[] }) {
  if (skills.length === 0) return <p className="text-gray-500 text-sm">No crafting data.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium">Craft</th>
          <th className="pb-2 font-medium">Level</th>
          <th className="pb-2 font-medium">Rank</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((s) => (
          <tr key={s.craft} className="border-b border-gray-800">
            <td className="py-1.5">{s.craft}</td>
            <td className="py-1.5 text-gray-300">{s.level}</td>
            <td className="py-1.5 text-gray-400">{s.rank}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Implement CharacterDetailPage**

```tsx
// src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { CharacterDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import GearTable from '../components/GearTable'
import CraftingTable from '../components/CraftingTable'

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<CharacterDetail>(`/api/characters/${id}`)
      .then(setCharacter)
      .catch(() => setCharacter(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-gray-400">Loading...</p>
  if (!character) return <p className="text-red-400">Character not found.</p>

  return (
    <div>
      <Link to="/dashboard" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <span className="text-gray-400">{character.server}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            character.licenseStatus === 'Active'
              ? 'bg-green-900/50 text-green-400'
              : 'bg-gray-800 text-gray-500'
          }`}
        >
          {character.licenseStatus}
        </span>
      </div>

      {character.lastSyncAt && (
        <p className="text-sm text-gray-500 mb-6">
          Last synced: {new Date(character.lastSyncAt).toLocaleString()}
        </p>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Jobs</h2>
        <JobsGrid jobs={character.jobs} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Equipment</h2>
        <GearTable gear={character.gear} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Crafting</h2>
        <CraftingTable skills={character.craftingSkills} />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

---

### Task 9: API Keys Page

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ApiKeysPage.tsx`

- [ ] **Step 1: Implement ApiKeysPage**

```tsx
// src/Vanalytics.Web/src/pages/ApiKeysPage.tsx
import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ApiKeyResponse } from '../types/api'

export default function ApiKeysPage() {
  const { user } = useAuth()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(user?.hasApiKey ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await api<ApiKeyResponse>('/api/keys/generate', { method: 'POST' })
      setApiKey(res.apiKey)
      setHasKey(true)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke your API key? The Windower addon will stop syncing.')) return
    setError('')
    setLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      setHasKey(false)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">API Key Management</h1>

      <div className="max-w-lg rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p className="text-sm text-gray-400 mb-4">
          Your API key is used by the Windower addon to sync character data.
          Generating a new key invalidates the previous one.
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {apiKey && (
          <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3">
            <p className="text-xs text-gray-500 mb-1">
              Copy this key now — it won't be shown again.
            </p>
            <code className="text-sm text-green-400 break-all select-all">{apiKey}</code>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {hasKey ? 'Regenerate Key' : 'Generate Key'}
          </button>

          {hasKey && (
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
            >
              Revoke Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 10: Public Profile Page

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/PublicProfilePage.tsx`

- [ ] **Step 1: Implement PublicProfilePage**

```tsx
// src/Vanalytics.Web/src/pages/PublicProfilePage.tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { CharacterDetail } from '../types/api'
import JobsGrid from '../components/JobsGrid'
import GearTable from '../components/GearTable'
import CraftingTable from '../components/CraftingTable'

export default function PublicProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [character, setCharacter] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/profiles/${server}/${name}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true)
          return
        }
        setCharacter(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [server, name])

  if (loading) return <p className="text-gray-400">Loading profile...</p>

  if (notFound) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-bold text-gray-400">Character Not Found</h2>
        <p className="text-gray-500 mt-2">
          {name} on {server} doesn't have a public profile.
        </p>
      </div>
    )
  }

  if (!character) return null

  const activeJob = character.jobs.find((j) => j.isActive)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{character.name}</h1>
        <p className="text-gray-400">{character.server}</p>
        {activeJob && (
          <p className="mt-2 text-lg text-blue-400">
            {activeJob.job} Lv.{activeJob.level}
          </p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Jobs</h2>
        <JobsGrid jobs={character.jobs} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Equipment</h2>
        <GearTable gear={character.gear} />
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Crafting</h2>
        <CraftingTable skills={character.craftingSkills} />
      </section>

      {character.lastSyncAt && (
        <p className="text-xs text-gray-600">
          Last updated: {new Date(character.lastSyncAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 11: Landing Page

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/LandingPage.tsx`

- [ ] **Step 1: Implement LandingPage**

```tsx
// src/Vanalytics.Web/src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="text-center py-20">
      <h1 className="text-5xl font-bold mb-4">
        <span className="text-blue-400">Vanalytics</span>
      </h1>
      <p className="text-xl text-gray-400 mb-2">Vana'diel + Analytics</p>
      <p className="text-gray-500 mb-8 max-w-lg mx-auto">
        Track your Final Fantasy XI character progress. Sync your jobs, gear,
        and crafting skills automatically with the Windower addon.
      </p>
      <div className="flex justify-center gap-4">
        {user ? (
          <Link
            to="/dashboard"
            className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Go to Dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
            >
              Get Started
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 12: Docker Compose Integration

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add web service to docker-compose.yml**

Add a `web` service for the Vite dev server:

```yaml
  web:
    build:
      context: src/Vanalytics.Web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      API_PROXY_TARGET: "http://api:8080"
    depends_on:
      - api
```

- [ ] **Step 2: Create a dev Dockerfile for the React app**

```dockerfile
# src/Vanalytics.Web/Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]
```

- [ ] **Step 3: Update vite.config.ts proxy target for Docker**

The proxy target needs to work both locally (`localhost:5000`) and in Docker (`api:8080`). Update vite.config.ts:

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Verify Docker Compose starts all 3 services**

```bash
docker compose up --build -d
sleep 10
curl http://localhost:3000
curl http://localhost:5000/health
docker compose down
```

Expected: Both the React dev server (port 3000) and API (port 5000) respond.
