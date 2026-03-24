import { useNavigate } from 'react-router-dom'
import { Pin, Lock, LockOpen } from 'lucide-react'
import type { EnrichedThreadSummaryResponse } from '../../types/api'
import UserAvatar from '../UserAvatar'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  thread: EnrichedThreadSummaryResponse
  categorySlug: string
  isModerator: boolean
  onTogglePin?: (threadId: number) => void
  onToggleLock?: (threadId: number) => void
}

export default function ForumThreadRow({ thread, categorySlug, isModerator, onTogglePin, onToggleLock }: Props) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/forum/${categorySlug}/${thread.slug}`)}
      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors ${
        thread.isPinned ? 'border-l-2 border-l-blue-600' : ''
      }`}
    >
      {thread.isPinned && <Pin className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
      {thread.isLocked && <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
      <span className="text-sm text-gray-200 truncate flex-1 font-medium">{thread.title}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <UserAvatar username={thread.authorUsername} size="sm" />
        <span className="text-xs text-gray-500 hidden sm:inline">{thread.authorUsername}</span>
      </div>
      <span className="text-xs text-gray-600 shrink-0 w-16 text-right">{thread.replyCount} replies</span>
      <span className="text-xs text-gray-600 shrink-0 w-14 text-right">{thread.voteCount} votes</span>
      <span className="text-xs text-gray-600 shrink-0 w-16 text-right hidden sm:block">{timeAgo(thread.lastPostAt)}</span>
      {isModerator && (
        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onTogglePin?.(thread.id)} className="p-1 text-gray-600 hover:text-blue-400" title={thread.isPinned ? 'Unpin' : 'Pin'}>
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onToggleLock?.(thread.id)} className="p-1 text-gray-600 hover:text-amber-400" title={thread.isLocked ? 'Unlock' : 'Lock'}>
            {thread.isLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}
