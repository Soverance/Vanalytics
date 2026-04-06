import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { UserProfileResponse } from '../types/api'
import UserAvatar from '../components/UserAvatar'

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const [profile, setProfile] = useState<UserProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setNotFound(false)
    api<UserProfileResponse>(`/api/users/${username}`)
      .then(setProfile)
      .catch(err => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [username])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !profile) {
    return <p className="text-center text-gray-500 py-20">User not found.</p>
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <UserAvatar username={profile.username} displayName={profile.displayName} avatarUrl={profile.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-gray-100">{profile.displayName ?? profile.username}</h1>
          {profile.displayName && <p className="text-sm text-gray-500">@{profile.username}</p>}
          <p className="text-xs text-gray-600">
            Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-gray-400">
        {profile.postCount} forum {profile.postCount === 1 ? 'post' : 'posts'}
      </div>

      {/* Recent Forum Activity */}
      {profile.recentPosts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Recent Forum Activity</h2>
          <div className="space-y-2">
            {profile.recentPosts.map(post => (
              <Link
                key={post.postId}
                to={`/forum/${post.categorySlug}/${post.threadSlug}`}
                className="block rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
              >
                <p className="text-sm font-medium text-gray-200">{post.threadTitle}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{post.bodyPreview}</p>
                <p className="text-xs text-gray-600 mt-1">{new Date(post.createdAt).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Public Characters */}
      {profile.publicCharacters.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Public Characters</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.publicCharacters.map(char => (
              <Link
                key={`${char.server}-${char.name}`}
                to={`/${char.server}/${char.name}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-200">{char.name}</p>
                  <p className="text-xs text-gray-500">{char.server}</p>
                </div>
                {char.activeJob && (
                  <span className="text-xs text-gray-400">{char.activeJob} {char.activeJobLevel}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
