import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { api } from '../../api/client'

interface Props {
  postId: number
  voteCount: number
  userVoted: boolean
  disabled?: boolean
}

export default function ForumVoteButton({ postId, voteCount: initialCount, userVoted: initialVoted, disabled }: Props) {
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(initialVoted)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (disabled || loading) return

    // Optimistic update
    const prevCount = count
    const prevVoted = voted
    setCount(voted ? count - 1 : count + 1)
    setVoted(!voted)

    try {
      setLoading(true)
      const result = await api<{ voteCount: number; userVoted: boolean }>(`/api/forum/posts/${postId}/vote`, { method: 'POST' })
      setCount(result.voteCount)
      setVoted(result.userVoted)
    } catch {
      // Revert on error
      setCount(prevCount)
      setVoted(prevVoted)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={disabled ? 'Sign in to vote' : voted ? 'Remove vote' : 'Upvote'}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
        voted
          ? 'bg-blue-900/50 text-blue-400 border border-blue-800/50'
          : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <ChevronUp className={`h-3.5 w-3.5 ${voted ? 'text-blue-400' : ''}`} />
      <span>{count}</span>
    </button>
  )
}
