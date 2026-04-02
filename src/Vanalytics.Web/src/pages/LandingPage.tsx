import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoginModal, LoginModalProvider } from '../context/LoginModalContext'
import LoginModal from '../components/LoginModal'

const features = [
  {
    title: 'Track Your Character',
    description:
      'See your character in full 3D with real-time gear updates. Browse your inventory, review session performance, and edit macros — all synced automatically from the game through a lightweight Windower addon.',
    media: '/img/landing/character-tracker.webp',
    type: 'image' as const,
  },
  {
    title: 'Explore the World',
    description:
      'Browse every weapon, armor piece, and NPC rendered in 3D. Fly through zone environments with dynamic lighting and spawn overlays. All models are parsed directly from the game\'s data files.',
    media: '/img/landing/model-viewers.webm',
    type: 'video' as const,
  },
  {
    title: 'Seamless Sync',
    description:
      'A lightweight Windower addon pushes your character data to Vanalytics in real-time. Generate an API key, install the addon, and your jobs, gear, inventory, and crafting skills appear automatically.',
    media: '/img/landing/windower-addon.webm',
    type: 'video' as const,
  },
]

function LandingContent() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { isOpen: loginOpen, open: openLogin, close: closeLogin } = useLoginModal()

  useEffect(() => {
    if (!loading && user) navigate('/characters', { replace: true })
  }, [user, loading, navigate])

  if (loading || user) return null

  return (
    <div className="relative min-h-screen bg-gray-950 text-gray-100">
      {/* Background orb */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
        <div className="relative w-[675px] h-[675px]">
          <img
            src="/vanalytics-square-logo.png"
            alt=""
            className="w-full h-full animate-orb-pulse"
          />
          {/* Lava glow overlay — targets the warm center of the orb */}
          <div
            className="absolute inset-0 animate-lava-glow"
            style={{
              background: 'radial-gradient(ellipse 40% 35% at 50% 55%, rgba(255, 120, 30, 0.35) 0%, rgba(255, 60, 10, 0.15) 40%, transparent 70%)',
              mixBlendMode: 'screen',
            }}
          />
        </div>
      </div>

      {/* Hero */}
      <div className="relative mx-auto max-w-5xl px-4 py-20 text-center" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-center mb-6">
          <img src="/vanalytics-square-logo.png" alt="" className="h-16 w-16 shrink-0 -mr-2" />
          <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="max-w-[280px]" />
        </div>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          Character tracker, model viewer, and in-game tools for Final Fantasy XI.
        </p>
        <button
          onClick={openLogin}
          className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium hover:bg-blue-500 transition-colors"
        >
          Get Started
        </button>
      </div>

      {/* Feature sections */}
      <div className="relative mx-auto max-w-6xl px-4" style={{ zIndex: 1 }}>
        {features.map((feature, index) => {
          const imageLeft = index % 2 === 0
          return (
            <div
              key={feature.title}
              className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 py-16 lg:py-24"
            >
              <div className={`w-full lg:w-1/2 ${imageLeft ? '' : 'lg:order-2'}`}>
                {feature.type === 'video' ? (
                  <video
                    src={feature.media}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full rounded-lg border border-gray-800"
                  />
                ) : (
                  <>
                    <img
                      src={feature.media}
                      alt={feature.title}
                      className="w-full rounded-lg border border-gray-800"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.style.display = 'none'
                        target.nextElementSibling?.classList.remove('hidden')
                      }}
                    />
                    <div className="hidden aspect-[8/5] w-full rounded-lg border border-gray-800 bg-gray-800" />
                  </>
                )}
              </div>
              <div className={`w-full lg:w-1/2 ${imageLeft ? '' : 'lg:order-1'}`}>
                <h2 className="text-2xl font-bold mb-4">{feature.title}</h2>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>

              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <footer className="relative border-t border-gray-800 mt-16" style={{ zIndex: 1 }}>
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span>Vanalytics v{__APP_VERSION__}</span>
          <div className="flex items-center gap-6">
            <a href="https://soverance.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Privacy</a>
            <a href="https://soverance.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Terms</a>
            <button
              onClick={openLogin}
              className="hover:text-gray-300 transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>

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
