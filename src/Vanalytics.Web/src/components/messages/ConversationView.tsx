import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import MessageBody from './MessageBody'

interface MessageDto { id: number; conversationId: number; senderId: string; body: string; createdAt: string }
interface ConversationUser { id: string; username: string | null; displayName: string | null; avatarUrl: string | null }
interface Detail { id: number; other: ConversationUser; messages: MessageDto[]; hasMore: boolean }

type ReportStatus = 'idle' | 'submitting' | 'done' | 'error'

export default function ConversationView({ conversationId, onSent }: { conversationId: number; onSent?: () => void }) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNote, setReportNote] = useState('')
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle')
  const [reportError, setReportError] = useState<string | null>(null)

  async function load() {
    try { setDetail(await api<Detail>(`/api/messages/conversations/${conversationId}`)) }
    catch { setDetail(null) }
  }
  useEffect(() => { load() }, [conversationId])
  useEffect(() => { endRef.current?.scrollIntoView() }, [detail?.messages.length])

  // Close report modal on Escape
  useEffect(() => {
    if (!reportOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeReportModal() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [reportOpen])

  function openReportModal() {
    setReportNote('')
    setReportStatus('idle')
    setReportError(null)
    setReportOpen(true)
  }

  function closeReportModal() {
    if (reportStatus === 'submitting') return
    setReportOpen(false)
    setReportStatus('idle')
    setReportNote('')
    setReportError(null)
  }

  async function submitReport() {
    if (!detail || reportStatus === 'submitting') return
    setReportStatus('submitting')
    setReportError(null)
    try {
      await api(`/api/messages/conversations/${detail.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ note: reportNote.trim() || null }),
      })
      setReportStatus('done')
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Could not submit report.')
      setReportStatus('error')
    }
  }

  async function send() {
    const text = body.trim()
    if (!text || !detail) return
    setError(null)
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ toUserId: detail.other.id, body: text }) })
      setBody(''); await load(); onSent?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    }
  }

  async function block() {
    if (!detail) return
    await api(`/api/users/${detail.other.id}/block`, { method: 'POST' }).catch(() => {})
    onSent?.()
  }

  if (!detail) return <div className="p-4 text-sm text-gray-500">Select a conversation.</div>
  const name = detail.other.displayName ?? detail.other.username ?? 'User'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <span className="text-sm font-medium text-gray-200">{name}</span>
        <div className="flex gap-3 text-xs">
          <button onClick={openReportModal} className="text-gray-400 hover:text-gray-200">Report</button>
          <button onClick={block} className="text-red-400 hover:text-red-300">Block</button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {detail.messages.map((m) => (
          <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.senderId === user?.id ? 'ml-auto bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
            <MessageBody body={m.body} />
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="px-4 text-xs text-red-400">{error}</p>}
      <div className="border-t border-gray-800 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          placeholder="Write a message…"
          className="w-full resize-none rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none"
        />
      </div>

      {/* Report modal */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeReportModal}
        >
          <div
            className="rounded-lg p-6 max-w-md w-full mx-4 bg-gray-900 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Report conversation</h2>

            {reportStatus === 'done' ? (
              <>
                <p className="text-sm text-gray-300 mb-4">Report submitted — thank you.</p>
                <div className="flex justify-end">
                  <button
                    onClick={closeReportModal}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={3}
                  disabled={reportStatus === 'submitting'}
                  className="w-full resize-none rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-gray-500 mb-3 disabled:opacity-50"
                />
                {reportStatus === 'error' && reportError && (
                  <p className="text-xs text-red-400 mb-3">{reportError}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeReportModal}
                    disabled={reportStatus === 'submitting'}
                    className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={reportStatus === 'submitting'}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                  >
                    {reportStatus === 'submitting' ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
