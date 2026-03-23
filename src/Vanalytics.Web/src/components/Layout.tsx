import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoginModalProvider, useLoginModal } from '../context/LoginModalContext'
import UserAvatar from './UserAvatar'
import LoginModal from './LoginModal'
import { LayoutDashboard, Swords, Menu, ShieldCheck, Users, BookOpen, Radio, Package, Store, Database, Clock, KeyRound } from 'lucide-react'
import { CompareProvider } from './compare/CompareContext'
import CompareTray from './compare/CompareTray'
import { SyncProvider } from '../context/SyncContext'
import SyncBanner from './SyncBanner'
import { FfxiFileSystemProvider } from '../context/FfxiFileSystemContext'

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

export default function Layout() {
  return (
    <LoginModalProvider>
      <LayoutInner />
    </LoginModalProvider>
  )
}

function LayoutInner() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isOpen: loginOpen, close: closeLogin } = useLoginModal()

  return (
    <FfxiFileSystemProvider>
    <SyncProvider>
    <CompareProvider>
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="border-b border-gray-800 px-4 py-4">
          <Link to="/dashboard" className="flex items-center min-w-0" onClick={() => setSidebarOpen(false)}>
            <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
            <img
              src="/vanalytics-typography-horizontal-logo.png"
              alt="Vana'lytics"
              className="min-w-0 max-w-full"
            />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4" onClick={() => setSidebarOpen(false)}>
          <SidebarLink to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/characters" label="Characters" icon={<Swords className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/servers" label="Server Status" icon={<Radio className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/items" label="Item Database" icon={<Package className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/bazaar" label="Bazaar Activity" icon={<Store className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/clock" label="Vana'diel Clock" icon={<Clock className="h-4 w-4 shrink-0" />} />
          <SidebarLink to="/setup" label="Setup Guide" icon={<BookOpen className="h-4 w-4 shrink-0" />} />

          {user?.role === 'Admin' && (
            <>
              <div className="flex items-center gap-2 px-3 pt-6 pb-2">
                <ShieldCheck className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Admin</span>
              </div>
              <SidebarLink to="/admin/users" label="Users" icon={<Users className="h-4 w-4 shrink-0" />} />
              <SidebarLink to="/admin/data" label="Data" icon={<Database className="h-4 w-4 shrink-0" />} />
              <SidebarLink to="/admin/saml" label="SAML" icon={<KeyRound className="h-4 w-4 shrink-0" />} />
            </>
          )}
        </nav>

        {/* User profile */}
        <NavLink
          to="/profile"
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 border-t border-gray-800 px-4 py-3 transition-colors ${
              isActive
                ? 'bg-gray-800'
                : 'hover:bg-gray-800/50'
            }`
          }
        >
          <UserAvatar username={user?.username ?? ''} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.username}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </NavLink>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link to="/dashboard" className="flex items-center min-w-0">
            <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
            <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="min-w-0 max-w-[180px]" />
          </Link>
        </header>

        <SyncBanner />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 pb-16">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
    <CompareTray />
    {loginOpen && <LoginModal onClose={closeLogin} />}
    </CompareProvider>
    </SyncProvider>
    </FfxiFileSystemProvider>
  )
}
