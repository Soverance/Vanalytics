import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoginModalProvider, useLoginModal } from '../context/LoginModalContext'
import UserAvatar from './UserAvatar'
import LoginModal from './LoginModal'
import { Swords, Menu, ShieldCheck, Users, BookOpen, Radio, Package, Database, Clock, KeyRound, Bug, ChevronRight, Map, MessageSquare, Flag, Coins, Trophy } from 'lucide-react'
import { CompareProvider } from './compare/CompareContext'
import CompareTray from './compare/CompareTray'
import { SyncProvider } from '../context/SyncContext'
import SyncBanner from './SyncBanner'
import { FfxiFileSystemProvider } from '../context/FfxiFileSystemContext'
import SidebarClock from './SidebarClock'
import NotificationBell from './notifications/NotificationBell'
import { useNotificationSummary } from '../hooks/useNotificationSummary'

type SectionName = 'database' | 'economy' | 'server' | 'community' | 'admin'

function getSection(pathname: string): SectionName | null {
  if (pathname.startsWith('/items') || pathname.startsWith('/npcs') || pathname.startsWith('/zones') || pathname.startsWith('/recipes')) return 'database'
  if (pathname.startsWith('/bazaar')) return 'economy'
  if (pathname.startsWith('/forum') || pathname.startsWith('/players') || pathname.startsWith('/linkshells') || pathname.startsWith('/users/') || pathname.startsWith('/messages') || pathname.startsWith('/leaderboards')) return 'community'
  if (pathname.startsWith('/server/')) return 'server'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}

function SidebarLink({ to, label, icon, end = true, onClick, badge }: { to: string; label: string; icon: ReactNode; end?: boolean; onClick?: () => void; badge?: number }) {
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
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
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
  const { summary: notifSummary } = useNotificationSummary()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isOpen: loginOpen, open: openLogin, close: closeLogin } = useLoginModal()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((d) => setVersion(d.version ?? null))
      .catch(() => {})
  }, [])

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
    <div className="min-h-screen bg-gray-950 bg-gradient-to-br from-gray-950 via-gray-950 to-indigo-950/50 text-gray-100 flex relative">
      {/* Ambient radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 75% 20%, rgba(99, 102, 241, 0.08), transparent 60%), radial-gradient(ellipse 60% 40% at 15% 85%, rgba(139, 92, 246, 0.06), transparent 60%)',
        }}
      />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gradient-to-br from-gray-900/80 via-gray-900/70 to-indigo-950/30 backdrop-blur-sm shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar ambient highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 35% at 50% 0%, rgba(139, 92, 246, 0.10), transparent 70%)',
          }}
        />
        {/* Logo */}
        <div className="border-b border-gray-800 px-4 py-4">
          <Link to={user ? '/characters' : '/'} className="flex items-center min-w-0" onClick={() => setSidebarOpen(false)}>
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

          <SidebarSection label="Explore" icon={<Database className="h-4 w-4 shrink-0" />} isOpen={openSection === 'database'} onToggle={() => toggleSection('database')}>
            <SidebarLink to="/items" end={false} label="Items" icon={<Package className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/npcs" label="NPCs" icon={<Bug className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/zones" label="Zones" icon={<Map className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/recipes" label="Recipes" icon={<BookOpen className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          {/* Economy section hidden until bazaar sync bugs are resolved
          <SidebarSection label="Economy" icon={<Store className="h-4 w-4 shrink-0" />} isOpen={openSection === 'economy'} onToggle={() => toggleSection('economy')}>
            <SidebarLink to="/bazaar" label="Bazaar" icon={<Store className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>
          */}

<SidebarSection label="Server" icon={<Radio className="h-4 w-4 shrink-0" />} isOpen={openSection === 'server'} onToggle={() => toggleSection('server')}>
            <SidebarLink to="/server/status" end={false} label="Status" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/server/clock" label="Clock" icon={<Clock className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Community" icon={<Users className="h-4 w-4 shrink-0" />} isOpen={openSection === 'community'} onToggle={() => toggleSection('community')}>
            <SidebarLink to="/players" label="Players" icon={<Users className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/linkshells" label="Linkshells" icon={<Users className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/leaderboards" label="Leaderboards" icon={<Trophy className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/forum" end={false} label="Forum" icon={<MessageSquare className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            {user && (
              <SidebarLink to="/messages" end={false} label="Messages" icon={<MessageSquare className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} badge={notifSummary.messages} />
            )}
          </SidebarSection>

          <SidebarLink to="/setup" label="Setup Guide" icon={<BookOpen className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          {user?.role === 'Admin' && (
            <SidebarSection label="Admin" icon={<ShieldCheck className="h-4 w-4 shrink-0" />} isOpen={openSection === 'admin'} onToggle={() => toggleSection('admin')}>
              <SidebarLink to="/admin/users" label="Users" icon={<Users className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/data" label="Data" icon={<Database className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/saml" label="SAML" icon={<KeyRound className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/reports" label="Reports" icon={<Flag className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/economy" label="Economy" icon={<Coins className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/achievements" label="Achievements" icon={<Trophy className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            </SidebarSection>
          )}
        </nav>

        <div className="border-t border-gray-800">
          <SidebarClock onClick={() => setSidebarOpen(false)} />
        </div>

        <div className="px-4 py-2 flex items-center gap-3 text-[11px] text-gray-600">
          {version && <span>v{version}</span>}
          <a href="https://soverance.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">Terms</a>
          <a href="https://soverance.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">Privacy</a>
          <a href="https://github.com/Soverance/Vanalytics" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-gray-400 transition-colors">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
        </div>

        {/* User profile */}
        {user ? (
          <div className="flex items-center border-t border-gray-800">
            <NavLink
              to="/profile"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex flex-1 items-center gap-3 min-w-0 px-4 py-3 transition-colors ${
                  isActive
                    ? 'bg-gray-800'
                    : 'hover:bg-gray-800/50'
                }`
              }
            >
              <UserAvatar username={user.username ?? ''} displayName={user.displayName} avatarUrl={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{user.displayName ?? user.username}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </NavLink>
            <div className="pr-4">
              <NotificationBell openUp />
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-800 px-4 py-3">
            <button
              onClick={() => { openLogin(); setSidebarOpen(false) }}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Sign In
            </button>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0 relative z-10">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <Link to={user ? '/characters' : '/'} className="flex items-center min-w-0">
            <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
            <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="min-w-0 max-w-[180px]" />
          </Link>
          {user && <div className="ml-auto"><NotificationBell /></div>}
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
