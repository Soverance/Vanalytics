import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="text-center py-20">
      <div className="flex items-center justify-center mb-6 mx-auto max-w-xl px-4">
        <img
          src="/vanalytics-square-logo.png"
          alt=""
          className="h-24 sm:h-32 shrink-0 -mr-3 sm:-mr-4"
        />
        <img
          src="/vanalytics-typography-horizontal-logo.png"
          alt="Vana'lytics"
          className="min-w-0 max-w-full"
        />
      </div>
      <p className="text-xl text-gray-400 mb-2">Vana'diel + Analytics</p>
      <p className="text-gray-500 mb-8 max-w-lg mx-auto">
        Track your Final Fantasy XI character progress. Sync your jobs, gear,
        and crafting skills automatically with the Windower addon.
      </p>
      <div className="flex justify-center gap-4">
        {user ? (
          <Link
            to="/characters"
            className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            My Characters
          </Link>
        ) : (
          <Link
            to="/login"
            className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Get Started
          </Link>
        )}
      </div>
    </div>
  )
}
