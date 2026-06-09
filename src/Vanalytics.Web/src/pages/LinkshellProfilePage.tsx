import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { LinkshellProfile } from '../types/api'
import LoadingSpinner from '../components/LoadingSpinner'
import LinkshellPearl from '../components/character/LinkshellPearl'

// A current member is "stale" if not seen within this many days; rendered greyed.
const LINKSHELL_STALE_DAYS = 14

const RANK_STYLE: Record<string, string> = {
  Leader: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Sackholder: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Member: 'bg-gray-700/40 text-gray-400 border-gray-600/50',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function isStale(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() > LINKSHELL_STALE_DAYS * 86_400_000
}

export default function LinkshellProfilePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const [profile, setProfile] = useState<LinkshellProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    setLoadError(false)
    fetch(`/api/linkshells/${encodeURIComponent(server ?? '')}/${encodeURIComponent(name ?? '')}`)
      .then(async res => {
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) { setLoadError(true); return }
        setProfile(await res.json())
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [server, name])

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><LoadingSpinner /></div>

  if (notFound || loadError || !profile) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col items-center justify-center px-4">
        <p className="text-lg text-gray-300 mb-2">
          {loadError ? 'Could not load this linkshell.' : 'Linkshell not found.'}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          {loadError ? 'Please try again.' : 'It may have no current members, or the name is misspelled.'}
        </p>
        <Link to="/linkshells" className="text-blue-400 hover:underline text-sm">← Browse linkshells</Link>
      </div>
    )
  }

  const accent = `#${(profile.colorRgb & 0xffffff).toString(16).padStart(6, '0')}`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div
          className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 mb-6"
          style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <LinkshellPearl colorRgb={profile.colorRgb} size={36} title={profile.name} />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-100 truncate">{profile.name}</h1>
                <p className="text-sm text-gray-400">
                  {profile.server} · {profile.memberCount} member{profile.memberCount === 1 ? '' : 's'}
                  {' '}({profile.publicMemberCount} public) · active {timeAgo(profile.lastActiveAt)}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded border border-gray-600/50 bg-gray-800/40 px-2 py-1 text-[11px] text-gray-400">
              Recruitment: {profile.recruitmentStatus}
            </span>
          </div>
        </div>

        {/* Roster */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Roster</h2>
        <div className="rounded border border-gray-700/60 bg-gray-900/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-800">
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {profile.members.map((m, i) => {
                const stale = isStale(m.lastSeen)
                return (
                  <tr key={`${m.name}-${i}`} className={`hover:bg-gray-800/30 ${stale ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${RANK_STYLE[m.rank] ?? RANK_STYLE.Member}`}>
                        {m.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/${encodeURIComponent(profile.server)}/${encodeURIComponent(m.name)}`} className="text-gray-200 hover:text-blue-300">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{m.job ? `${m.job}${m.level ? ` ${m.level}` : ''}` : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{timeAgo(m.lastSeen)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {profile.privateMemberCount > 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-800/60">
              + {profile.privateMemberCount} private member{profile.privateMemberCount === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div className="mt-6">
          <Link to="/linkshells" className="text-blue-400 hover:underline text-sm">← Browse linkshells</Link>
        </div>
      </div>
    </div>
  )
}
