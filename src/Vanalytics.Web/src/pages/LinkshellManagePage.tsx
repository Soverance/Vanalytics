import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { LinkshellProfileResponse, LinkshellExternalLink } from '../types/api'
import { api, uploadFile, getStoredTokens } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ForumEditor from '../components/forum/ForumEditor'

const STATUSES = ['Unknown', 'Open', 'Closed']
const MAX_LINKS = 5

export default function LinkshellManagePage() {
  const { server, name } = useParams<{ server: string; name: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<LinkshellProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [status, setStatus] = useState('Unknown')
  const [links, setLinks] = useState<LinkshellExternalLink[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const profilePath = `/${encodeURIComponent(server ?? '')}/linkshell/${encodeURIComponent(name ?? '')}`

  useEffect(() => {
    setLoading(true)
    const { accessToken } = getStoredTokens()
    const headers: Record<string, string> = {}
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    fetch(`/api/linkshells/${encodeURIComponent(server ?? '')}/${encodeURIComponent(name ?? '')}`, { headers })
      .then(async res => {
        if (!res.ok) { setForbidden(true); return }
        const p: LinkshellProfileResponse = await res.json()
        if (!p.canManage) { setForbidden(true); return }
        setData(p)
        setDescription(p.profile?.description ?? '')
        setRules(p.profile?.recruitmentRules ?? '')
        setStatus(p.recruitmentStatus || 'Unknown')
        setLinks(p.profile?.externalLinks ?? [])
        setLogoUrl(p.profile?.logoUrl ?? null)
      })
      .catch(() => setForbidden(true))
      .finally(() => setLoading(false))
  }, [server, name])

  const addLink = () => { if (links.length < MAX_LINKS) setLinks([...links, { label: '', url: '' }]) }
  const updateLink = (i: number, patch: Partial<LinkshellExternalLink>) =>
    setLinks(links.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))

  const handleLogo = async (file: File) => {
    if (!data) return
    setError('')
    try {
      const result = await uploadFile<{ url: string }>(`/api/linkshells/${data.linkshellId}/logo`, file)
      setLogoUrl(result.url)
    } catch {
      setError('Logo upload failed.')
    }
  }

  const clearLogo = async () => {
    if (!data) return
    try {
      await api(`/api/linkshells/${data.linkshellId}/logo`, { method: 'DELETE' })
      setLogoUrl(null)
    } catch {
      setError('Could not remove the logo.')
    }
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    setError('')
    try {
      await api(`/api/linkshells/${data.linkshellId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          description,
          recruitmentStatus: status,
          recruitmentRules: rules,
          externalLinks: links.filter(l => l.label.trim() || l.url.trim()),
        }),
      })
      navigate(profilePath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setSaving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><LoadingSpinner /></div>

  if (forbidden || !data) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col items-center justify-center px-4">
        <p className="text-lg text-gray-300 mb-2">You can't manage this linkshell.</p>
        <p className="text-sm text-gray-500 mb-6">Only its current leader or sackholders can edit this profile.</p>
        <Link to={profilePath} className="text-blue-400 hover:underline text-sm">← Back to linkshell</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-1">Manage {data.name}</h1>
        <p className="text-sm text-gray-400 mb-6">{data.server}</p>

        {error && <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        {/* Logo */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Logo</label>
        <div className="flex items-center gap-3 mb-6">
          {logoUrl
            ? <img src={logoUrl} alt="" className="h-16 w-16 rounded object-cover border border-gray-700" />
            : <div className="h-16 w-16 rounded border border-dashed border-gray-700 flex items-center justify-center text-xs text-gray-600">none</div>}
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                 onChange={e => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = '' }}
                 className="text-xs text-gray-400" />
          {logoUrl && <button type="button" onClick={clearLogo} className="text-xs text-red-400 hover:underline">Remove</button>}
        </div>

        {/* Recruitment status */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Recruitment status</label>
        <select value={status} onChange={e => setStatus(e.target.value)}
                className="mb-6 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Description */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Description</label>
        <div className="mb-6"><ForumEditor content={description} onChange={setDescription} placeholder="Tell players about your linkshell..." /></div>

        {/* Rules */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Recruitment rules</label>
        <div className="mb-6"><ForumEditor content={rules} onChange={setRules} placeholder="Requirements, expectations, how to apply..." /></div>

        {/* Links */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">External links ({links.length}/{MAX_LINKS})</label>
        <div className="space-y-2 mb-6">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input value={l.label} onChange={e => updateLink(i, { label: e.target.value })} placeholder="Label"
                     className="w-1/3 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm" />
              <input value={l.url} onChange={e => updateLink(i, { url: e.target.value })} placeholder="https://..."
                     className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm" />
              <button type="button" onClick={() => removeLink(i)} className="px-2 text-red-400 hover:text-red-300">✕</button>
            </div>
          ))}
          {links.length < MAX_LINKS && (
            <button type="button" onClick={addLink} className="text-xs text-blue-400 hover:underline">+ Add link</button>
          )}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={save} disabled={saving}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <Link to={profilePath} className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</Link>
        </div>
      </div>
    </div>
  )
}
