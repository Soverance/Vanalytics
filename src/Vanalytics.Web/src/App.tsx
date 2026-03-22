import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import OAuthCallback from './pages/OAuthCallback'
import LandingPage from './pages/LandingPage'
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
import VanadielClockPage from './pages/VanadielClockPage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public: landing page (no layout) */}
          <Route path="/" element={<LandingPage />} />

          {/* Public: shareable character profiles (no layout) */}
          <Route path="/:server/:name" element={<PublicProfilePage />} />

          {/* OAuth callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* All app pages: sidebar layout + auth required */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/characters" element={<ProtectedRoute><CharactersPage /></ProtectedRoute>} />
            <Route path="/characters/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/servers" element={<ProtectedRoute><ServerStatusPage /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><ItemDatabasePage /></ProtectedRoute>} />
            <Route path="/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
            <Route path="/bazaar" element={<ProtectedRoute><BazaarActivityPage /></ProtectedRoute>} />
            <Route path="/clock" element={<ProtectedRoute><VanadielClockPage /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute><SetupGuidePage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/data" element={<ProtectedRoute><AdminItemsPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
