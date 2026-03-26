import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoginModal, LoginModalProvider } from '../context/LoginModalContext'
import LoginModal from '../components/LoginModal'
import { Swords, Radio, Package, Store, Clock, BookOpen } from 'lucide-react'

function LandingContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { isOpen: loginOpen, open: openLogin, close: closeLogin } = useLoginModal()

  if (user) {
    navigate('/characters', { replace: true })
    return null
  }

  const features = [
    { icon: Swords, title: 'Character Tracking', desc: 'Automatically sync your jobs, gear, and crafting skills from the game.' },
    { icon: Package, title: 'Item Database', desc: 'Browse the complete FFXI item database with stats and pricing.' },
    { icon: Store, title: 'Bazaar Activity', desc: 'Track bazaar listings and find deals across servers.' },
    { icon: Radio, title: 'Server Status', desc: 'Real-time monitoring of FFXI server availability.' },
    { icon: Clock, title: "Vana'diel Clock", desc: 'Moon phases, guild hours, RSE schedule, conquest tally, and ferry times.' },
    { icon: BookOpen, title: 'Easy Setup', desc: 'Install the Windower addon, sync, and your data appears automatically.' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <img src="/vanalytics-square-logo.png" alt="" className="h-16 w-16 shrink-0 -mr-2" />
            <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="max-w-[280px]" />
          </div>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Track your Final Fantasy XI characters, browse the item database, monitor server status, and more.
          </p>
          <button
            onClick={openLogin}
            className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Get Started
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <f.icon className="h-8 w-8 text-blue-400 mb-3" />
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {loginOpen && <LoginModal onClose={closeLogin} />}
    </div>
  )
}

export default function LandingPage() {
  return (
    <LoginModalProvider>
      <LandingContent />
    </LoginModalProvider>
  )
}
