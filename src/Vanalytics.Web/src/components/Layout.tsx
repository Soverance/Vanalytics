import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoginModalProvider, useLoginModal } from '../context/LoginModalContext'
import UserAvatar from './UserAvatar'
import LoginModal from './LoginModal'
import { Swords, Menu, ShieldCheck, Users, BookOpen, Radio, Package, Store, Database, Clock, KeyRound, Bug, ChevronRight, Map, MessageSquare } from 'lucide-react'
import { CompareProvider } from './compare/CompareContext'
import CompareTray from './compare/CompareTray'
import { SyncProvider } from '../context/SyncContext'
import SyncBanner from './SyncBanner'
import { FfxiFileSystemProvider } from '../context/FfxiFileSystemContext'

type SectionName = 'database' | 'economy' | 'performance' | 'server' | 'admin'

function getSection(pathname: string): SectionName | null {
  if (pathname.startsWith('/items') || pathname.startsWith('/npcs') || pathname.startsWith('/zones')) return 'database'
  if (pathname.startsWith('/bazaar')) return 'economy'
  if (pathname.startsWith('/sessions')) return 'performance'
  if (pathname.startsWith('/server/')) return 'server'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}

function SidebarLink({ to, label, icon, end = true, onClick }: { to: string; label: string; icon: ReactNode; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
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

function SidebarSection({
  label,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  label: string
  icon: ReactNode
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const id = `sidebar-section-${label.toLowerCase()}`
  const btnId = `${id}-btn`
  return (
    <div>
      <button
        id={btnId}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-expanded={isOpen}
        aria-controls={id}
        className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-200 cursor-pointer"
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={btnId}
        className={`overflow-hidden transition-[grid-template-rows] duration-200 grid ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0">
          <div className="space-y-1 py-1 pl-7">
            {children}
          </div>
        </div>
      </div>
    </div>
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

  const { pathname } = useLocation()
  const [openSection, setOpenSection] = useState<SectionName | null>(() => getSection(pathname))

  useEffect(() => {
    setOpenSection(getSection(pathname))
  }, [pathname])

  const toggleSection = (section: SectionName) => {
    setOpenSection((prev) => (prev === section ? null : section))
  }

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="border-b border-gray-800 px-4 py-4">
          <Link to="/characters" className="flex items-center min-w-0" onClick={() => setSidebarOpen(false)}>
            <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
            <img
              src="/vanalytics-typography-horizontal-logo.png"
              alt="Vana'lytics"
              className="min-w-0 max-w-full"
            />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
          <SidebarLink to="/characters" label="Characters" icon={<Swords className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          <SidebarSection label="Database" icon={<Database className="h-4 w-4 shrink-0" />} isOpen={openSection === 'database'} onToggle={() => toggleSection('database')}>
            <SidebarLink to="/items" end={false} label="Items" icon={<Package className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/npcs" label="NPCs" icon={<Bug className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/zones" label="Zones" icon={<Map className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Economy" icon={<Store className="h-4 w-4 shrink-0" />} isOpen={openSection === 'economy'} onToggle={() => toggleSection('economy')}>
            <SidebarLink to="/bazaar" label="Bazaar" icon={<Store className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Performance" icon={<Swords className="h-4 w-4 shrink-0" />} isOpen={openSection === 'performance'} onToggle={() => toggleSection('performance')}>
            <SidebarLink to="/sessions" label="Sessions" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Server" icon={<Radio className="h-4 w-4 shrink-0" />} isOpen={openSection === 'server'} onToggle={() => toggleSection('server')}>
            <SidebarLink to="/server/status" end={false} label="Status" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/server/clock" label="Clock" icon={<Clock className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarLink to="/forum" end={false} label="Forum" icon={<MessageSquare className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          <SidebarLink to="/setup" label="Setup Guide" icon={<BookOpen className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          {user?.role === 'Admin' && (
            <SidebarSection label="Admin" icon={<ShieldCheck className="h-4 w-4 shrink-0" />} isOpen={openSection === 'admin'} onToggle={() => toggleSection('admin')}>
              <SidebarLink to="/admin/users" label="Users" icon={<Users className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/data" label="Data" icon={<Database className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/saml" label="SAML" icon={<KeyRound className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            </SidebarSection>
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
          <Link to="/characters" className="flex items-center min-w-0">
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
