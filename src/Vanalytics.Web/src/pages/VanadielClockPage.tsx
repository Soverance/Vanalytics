import { useState, useEffect, useRef } from 'react'
import { api, ApiError } from '../api/client'
import type { VanadielClockData } from '../types/api'

const elementColors: Record<string, string> = {
  Fire: 'text-red-400',
  Earth: 'text-yellow-600',
  Water: 'text-blue-400',
  Wind: 'text-green-400',
  Ice: 'text-cyan-300',
  Lightning: 'text-purple-400',
  Light: 'text-yellow-200',
  Dark: 'text-gray-400',
}

const elementBg: Record<string, string> = {
  Fire: 'bg-red-900/30 border-red-800',
  Earth: 'bg-yellow-900/30 border-yellow-800',
  Water: 'bg-blue-900/30 border-blue-800',
  Wind: 'bg-green-900/30 border-green-800',
  Ice: 'bg-cyan-900/30 border-cyan-800',
  Lightning: 'bg-purple-900/30 border-purple-800',
  Light: 'bg-yellow-900/20 border-yellow-700',
  Dark: 'bg-gray-800/50 border-gray-700',
}

const moonIcons: Record<string, string> = {
  'New Moon': '\u{1F311}',
  'Waxing Crescent': '\u{1F312}',
  'First Quarter': '\u{1F313}',
  'Waxing Gibbous': '\u{1F314}',
  'Full Moon': '\u{1F315}',
  'Waning Gibbous': '\u{1F316}',
  'Last Quarter': '\u{1F317}',
  'Waning Crescent': '\u{1F318}',
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatCountdown(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const vanadielMonths = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function VanadielClockPage() {
  const [clock, setClock] = useState<VanadielClockData | null>(null)
  const [error, setError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchClock = () => {
    api<VanadielClockData>('/api/servers/clock')
      .then(setClock)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Failed to load clock data')
      })
  }

  useEffect(() => {
    fetchClock()
    // Refresh every 2.3 seconds (1 Vana'diel minute = 60/25 = 2.4 real seconds)
    intervalRef.current = setInterval(fetchClock, 2400)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (!clock) {
    return <p className="text-gray-400">{error || 'Loading Vana\'diel clock...'}</p>
  }

  const { time, dayOfWeek, element, moon, conquest, guilds, ferry, rse } = clock

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vana'diel Clock</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Primary clock display */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {/* Vana'diel Time */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Vana'diel Time</h2>
          <p className="text-3xl font-mono font-bold tabular-nums">
            {pad(time.hour)}:{pad(time.minute)}:{pad(time.second)}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {vanadielMonths[time.month]} {time.day}, {time.year} C.E.
          </p>
        </div>

        {/* Day of the Week */}
        <div className={`rounded-lg border p-5 ${elementBg[element] ?? 'border-gray-800 bg-gray-900'}`}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Day of the Week</h2>
          <p className={`text-3xl font-bold ${elementColors[element] ?? 'text-gray-200'}`}>
            {dayOfWeek}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Element: {element}
          </p>
        </div>

        {/* Moon Phase */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Moon Phase</h2>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{moonIcons[moon.phaseName] ?? '\u{1F315}'}</span>
            <div>
              <p className="text-xl font-bold">{moon.phaseName}</p>
              <p className="text-sm text-gray-400">{moon.percent}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conquest Tally */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Conquest Tally</h2>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-amber-400">
            {formatCountdown(conquest.earthSecondsRemaining)}
          </span>
          <span className="text-sm text-gray-500">
            until next tally ({conquest.vanadielDaysRemaining} Vana'diel days)
          </span>
        </div>
      </div>

      {/* Guild Hours & RSE side by side */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        {/* Guild Hours */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Crafting Guilds</h2>
          <div className="rounded border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Guild</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                  <th className="px-3 py-2 font-medium">Holiday</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {guilds.map((g) => (
                  <tr key={g.name} className="border-t border-gray-800">
                    <td className="px-3 py-2 font-medium">{g.name}</td>
                    <td className="px-3 py-2 text-gray-400">
                      {pad(g.openHour)}:00 – {pad(g.closeHour)}:00
                    </td>
                    <td className={`px-3 py-2 ${elementColors[dayOfWeek === g.holiday ? element : ''] ?? 'text-gray-400'}`}>
                      {g.holiday}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        g.isOpen
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {g.isOpen ? 'Open' : dayOfWeek === g.holiday ? 'Holiday' : 'Closed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RSE & Ferry */}
        <div className="space-y-4">
          {/* RSE Schedule */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">RSE Schedule</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Current Race</span>
                <span className="font-medium">{rse.currentRace}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Location</span>
                <span className="font-medium">{rse.currentLocation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Next Race</span>
                <span className="font-medium">{rse.nextRace}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Changes In</span>
                <span className="font-medium text-amber-400">
                  {formatCountdown(parseInt(rse.nextChangeEarthSeconds, 10))}
                </span>
              </div>
            </div>
          </div>

          {/* Ferry Schedule */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Ferry Schedule</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400 mb-1">Selbina → Mhaura</p>
                <div className="flex gap-4">
                  <span className="text-sm">
                    Departs: <span className="font-medium text-gray-200">{ferry.selbinaToMhaura.nextDeparture}</span>
                  </span>
                  <span className="text-sm">
                    Arrives: <span className="font-medium text-gray-200">{ferry.selbinaToMhaura.nextArrival}</span>
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Mhaura → Selbina</p>
                <div className="flex gap-4">
                  <span className="text-sm">
                    Departs: <span className="font-medium text-gray-200">{ferry.mhauraToSelbina.nextDeparture}</span>
                  </span>
                  <span className="text-sm">
                    Arrives: <span className="font-medium text-gray-200">{ferry.mhauraToSelbina.nextArrival}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
