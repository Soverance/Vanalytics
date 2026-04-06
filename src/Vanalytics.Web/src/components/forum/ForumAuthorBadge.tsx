import { Link } from 'react-router-dom'
import UserAvatar from '../UserAvatar'

interface Props {
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  postCount: number
  joinedAt: string
}

export default function ForumAuthorBadge({ username, displayName, avatarUrl, postCount, joinedAt }: Props) {
  return (
    <div className="flex flex-col items-center gap-1 w-24 shrink-0 py-2">
      <UserAvatar username={username} displayName={displayName} avatarUrl={avatarUrl} size="sm" />
      <Link to={`/users/${username}`} className="text-xs font-medium text-gray-300 truncate max-w-full hover:underline">
        {displayName ?? username}
      </Link>
      <span className="text-[10px] text-gray-600">{postCount} posts</span>
      <span className="text-[10px] text-gray-600">Joined {new Date(joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
    </div>
  )
}
