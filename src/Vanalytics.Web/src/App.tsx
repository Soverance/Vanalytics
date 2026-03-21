import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
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
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
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
              path="/servers"
              element={<ProtectedRoute><ServerStatusPage /></ProtectedRoute>}
            />
            <Route
              path="/setup"
              element={<ProtectedRoute><SetupGuidePage /></ProtectedRoute>}
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
            <Route path="/items" element={<ItemDatabasePage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bazaar" element={<BazaarActivityPage />} />
            <Route path="/:server/:name" element={<PublicProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
