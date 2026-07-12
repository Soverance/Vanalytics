import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { LinkshellProfileResponse, LinkshellExternalLink } from '../types/api'
import { api, uploadFile, getStoredTokens } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import ForumEditor from '../components/forum/ForumEditor'

const STATUSES = ['Unknown', 'Open', 'Closed']
const MAX_LINKS = 5
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const LOGO_MAX_BYTES = 5 * 1024 * 1024

// Subtle checkerboard so a transparent logo's edges are visible while editing.
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: '#1f2937',
  backgroundImage:
    'linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
}

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
  const [isPublic, setIsPublic] = useState(false)
  const [links, setLinks] = useState<LinkshellExternalLink[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

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
        setIsPublic(p.isPublic)
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
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Use a PNG, JPEG, GIF, or WebP image.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('Logo must be 5 MB or smaller.')
      return
    }
    setLogoUploading(true)
    try {
      const result = await uploadFile<{ url: string }>(`/api/linkshells/${data.linkshellId}/logo`, file)
      setLogoUrl(result.url)
    } catch {
      setError('Logo upload failed.')
    } finally {
      setLogoUploading(false)
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
          isPublic,
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
        <div className="flex items-center gap-4 mb-2">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-700"
            style={CHECKERBOARD}
          >
            {logoUrl
              ? <img src={logoUrl} alt="Linkshell logo" className="h-full w-full object-contain" />
              : <span className="text-[10px] text-gray-400">No logo</span>}
          </div>
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
              className="inline-flex items-center gap-2 rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {logoUploading ? 'Uploading...' : logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={clearLogo}
                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = '' }}
          />
        </div>
        <p className="text-xs text-gray-500 mb-6">Square PNG with a transparent background works best. Max 5&nbsp;MB.</p>

        {/* Visibility */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Visibility</label>
        <label className="mb-2 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={e => setIsPublic(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-800"
          />
          <span className="text-sm text-gray-300">
            List this linkshell publicly
            <span className="block text-xs text-gray-500">
              When on, anyone can find this linkshell in the directory and view its page. When off, only
              its members can see it and it stays out of the directory.
            </span>
          </span>
        </label>
        <div className="mb-6" />

        {/* Recruitment status */}
        <label className="block text-sm font-semibold text-gray-300 mb-2">Recruitment status</label>
        <select value={status} onChange={e => setStatus(e.target.value)}
                className="mb-6 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {status === 'Open' && (
          <p className="-mt-4 mb-6 text-xs text-gray-500">
            While recruitment is Open, applications arrive as direct messages to all current
            leaders and sackholders. Check your <Link to="/messages" className="text-blue-400 hover:underline">messages</Link>.
          </p>
        )}

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
