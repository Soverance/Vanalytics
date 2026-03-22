import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import OAuthCallback from './pages/OAuthCallback'
import DashboardPage from './pages/DashboardPage'
import CharactersPage from './pages/CharactersPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import ProfilePage from './pages/ProfilePage'
import SetupGuidePage from './pages/SetupGuidePage'
import ServerStatusPage from './pages/ServerStatusPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminItemsPage from './pages/AdminItemsPage'
import ItemDatabasePage from './pages/ItemDatabasePage'
import ItemDetailPage from './pages/ItemDetailPage'
import BazaarActivityPage from './pages/BazaarActivityPage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            {/* Root redirects to servers */}
            <Route path="/" element={<Navigate to="/servers" replace />} />

            {/* OAuth callback (handles code exchange, no UI) */}
            <Route path="/oauth/callback" element={<OAuthCallback />} />

            {/* Public pages (no auth required, sidebar visible) */}
            <Route path="/servers" element={<ServerStatusPage />} />
            <Route path="/items" element={<ItemDatabasePage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bazaar" element={<BazaarActivityPage />} />
            <Route path="/setup" element={<SetupGuidePage />} />
            <Route path="/:server/:name" element={<PublicProfilePage />} />

            {/* Protected pages (require login) */}
            <Route
              path="/dashboard"
              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="/characters"
              element={<ProtectedRoute><CharactersPage /></ProtectedRoute>}
            />
            <Route
              path="/characters/:id"
              element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>}
            />
            <Route
              path="/profile"
              element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
            />
            <Route
              path="/admin/users"
              element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>}
            />
            <Route
              path="/admin/items"
              element={<ProtectedRoute><AdminItemsPage /></ProtectedRoute>}
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
