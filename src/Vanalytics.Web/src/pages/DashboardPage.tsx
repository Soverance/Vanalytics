import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">
        Welcome back, {user?.username}. Your dashboard is coming soon.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/characters"
          className="rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-700 transition-colors"
        >
          <h2 className="font-semibold mb-1">Characters</h2>
          <p className="text-sm text-gray-500">Manage your FFXI characters</p>
        </Link>
        <Link
          to="/items"
          className="rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-700 transition-colors"
        >
          <h2 className="font-semibold mb-1">Item Database</h2>
          <p className="text-sm text-gray-500">Browse items and prices</p>
        </Link>
        <Link
          to="/servers"
          className="rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-700 transition-colors"
        >
          <h2 className="font-semibold mb-1">Server Status</h2>
          <p className="text-sm text-gray-500">Check FFXI server availability</p>
        </Link>
      </div>
    </div>
  )
}
