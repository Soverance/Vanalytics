import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import OAuthCallback from './pages/OAuthCallback'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import CharactersPage from './pages/CharactersPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import ProfilePage from './pages/ProfilePage'
import SetupGuidePage from './pages/SetupGuidePage'
import ServerStatusDashboard from './pages/ServerStatusDashboard'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminItemsPage from './pages/AdminItemsPage'
import AdminSamlPage from './pages/AdminSamlPage'
import ItemDatabasePage from './pages/ItemDatabasePage'
import ItemDetailPage from './pages/ItemDetailPage'
import BazaarActivityPage from './pages/BazaarActivityPage'
import VanadielClockPage from './pages/VanadielClockPage'
import PublicProfilePage from './pages/PublicProfilePage'
import ModelDebugPage from './pages/ModelDebugPage'
import NpcBrowserPage from './pages/NpcBrowserPage'
import ZoneBrowserPage from './pages/ZoneBrowserPage'
import ForumCategoryListPage from './pages/ForumCategoryListPage'
import ForumThreadListPage from './pages/ForumThreadListPage'
import ForumThreadPage from './pages/ForumThreadPage'
import ForumNewThreadPage from './pages/ForumNewThreadPage'

function SamlCodeHandler() {
  const { samlExchange } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('saml_code')
    const samlError = params.get('error')

    if (samlError) {
      const messages: Record<string, string> = {
        saml_failed: 'SSO authentication failed. Please try again.',
        no_username: 'No username was returned by the identity provider.',
        no_account: 'No matching account found. Contact your administrator.',
        disabled: 'Your account has been disabled.',
        saml_disabled: 'SSO is not currently enabled.',
      }
      setError(messages[samlError] || 'Authentication failed.')
      const url = new URL(window.location.href)
      url.searchParams.delete('error')
      window.history.replaceState({}, '', url.toString())
      return
    }

    if (!code) return

    const url = new URL(window.location.href)
    url.searchParams.delete('saml_code')
    window.history.replaceState({}, '', url.toString())

    samlExchange(code).catch(() => {
      setError('SSO login failed. Please try again.')
    })
  }, [])

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 max-w-md mx-4 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => setError('')}
            className="text-blue-400 hover:underline text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SamlCodeHandler />
        <Routes>
          {/* Public: landing page (no layout) */}
          <Route path="/" element={<LandingPage />} />

          {/* OAuth callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* App pages with sidebar layout */}
          <Route element={<Layout />}>
            {/* Public server routes (no auth required) */}
            <Route path="/server/status" element={<ServerStatusDashboard />} />
            <Route path="/server/clock" element={<VanadielClockPage />} />

            {/* Redirects for old routes */}
            <Route path="/servers" element={<Navigate to="/server/status" replace />} />
            <Route path="/clock" element={<Navigate to="/server/clock" replace />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/characters" element={<ProtectedRoute><CharactersPage /></ProtectedRoute>} />
            <Route path="/characters/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><ItemDatabasePage /></ProtectedRoute>} />
            <Route path="/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
            <Route path="/bazaar" element={<ProtectedRoute><BazaarActivityPage /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute><SetupGuidePage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/data" element={<ProtectedRoute><AdminItemsPage /></ProtectedRoute>} />
            <Route path="/admin/saml" element={<ProtectedRoute><AdminSamlPage /></ProtectedRoute>} />
            <Route path="/npcs" element={<ProtectedRoute><NpcBrowserPage /></ProtectedRoute>} />
            <Route path="/zones" element={<ProtectedRoute><ZoneBrowserPage /></ProtectedRoute>} />
            <Route path="/debug/models" element={<ProtectedRoute><ModelDebugPage /></ProtectedRoute>} />

            {/* Public forum routes */}
            <Route path="/forum" element={<ForumCategoryListPage />} />
            <Route path="/forum/:categorySlug" element={<ForumThreadListPage />} />
            <Route path="/forum/:categorySlug/new" element={<ProtectedRoute><ForumNewThreadPage /></ProtectedRoute>} />
            <Route path="/forum/:categorySlug/:threadSlug" element={<ForumThreadPage />} />
          </Route>

          {/* Public: shareable character profiles (MUST be after explicit routes) */}
          <Route path="/:server/:name" element={<PublicProfilePage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
