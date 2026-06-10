import { useState, useEffect } from 'react'
import { api, ApiError } from '../../api/client'
import type { CharacterSummary } from '../../types/api'

const MAX_INTRO = 2000

interface ApplyModalProps {
  linkshellId: string
  linkshellName: string
  server: string
  /** Sanitized recruitment-rules HTML, shown for context; may be null. */
  recruitmentRulesHtml: string | null
  onClose: () => void
  onApplied: () => void
}

export default function ApplyModal({
  linkshellId, linkshellName, server, recruitmentRulesHtml, onClose, onApplied,
}: ApplyModalProps) {
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [characterId, setCharacterId] = useState('')
  const [intro, setIntro] = useState('')
  const [loadingChars, setLoadingChars] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load the user's characters and keep only those on this LS's server.
  useEffect(() => {
    api<CharacterSummary[]>('/api/characters')
      .then(all => {
        const eligible = all.filter(c => c.server === server)
        setCharacters(eligible)
        if (eligible.length > 0) setCharacterId(eligible[0].id)
      })
      .catch(() => setError('Could not load your characters.'))
      .finally(() => setLoadingChars(false))
  }, [server])

  const submit = async () => {
    if (!characterId) { setError('Pick a character to apply with.'); return }
    if (!intro.trim()) { setError('Write a short introduction.'); return }
    setSubmitting(true)
    setError('')
    try {
      await api(`/api/linkshells/${linkshellId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ characterId, intro: intro.trim() }),
      })
      onApplied()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send your application.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-100">Apply to {linkshellName}</h2>
        <p className="mb-4 text-xs text-gray-500">
          Your application is sent as a direct message to the linkshell's leaders.
        </p>

        {error && (
          <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {recruitmentRulesHtml && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Recruitment rules</p>
            <div
              className="prose prose-invert prose-sm max-h-40 max-w-none overflow-y-auto rounded border border-gray-800 bg-gray-950/60 p-3"
              dangerouslySetInnerHTML={{ __html: recruitmentRulesHtml }}
            />
          </div>
        )}

        <label className="mb-1 block text-sm font-semibold text-gray-300">Apply as</label>
        {loadingChars ? (
          <p className="mb-4 text-sm text-gray-500">Loading your characters…</p>
        ) : characters.length === 0 ? (
          <p className="mb-4 text-sm text-amber-300">You have no synced characters on {server}.</p>
        ) : (
          <select
            value={characterId}
            onChange={e => setCharacterId(e.target.value)}
            className="mb-4 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <label className="mb-1 block text-sm font-semibold text-gray-300">Introduction</label>
        <textarea
          value={intro}
          onChange={e => setIntro(e.target.value.slice(0, MAX_INTRO))}
          placeholder="Tell them why you'd like to join…"
          rows={5}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        />
        <p className="mb-4 mt-1 text-right text-xs text-gray-600">{intro.length}/{MAX_INTRO}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button" onClick={onClose}
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button" onClick={submit}
            disabled={submitting || loadingChars || characters.length === 0}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send application'}
          </button>
        </div>
      </div>
    </div>
  )
}
