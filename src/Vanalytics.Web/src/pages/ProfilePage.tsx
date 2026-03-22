import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../api/client'
import UserAvatar from '../components/UserAvatar'
import type { ApiKeyResponse } from '../types/api'

type Tab = 'session' | 'apikeys'

const tabs: { id: Tab; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'apikeys', label: 'API Keys' },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = tabs.find(t => t.id === searchParams.get('tab'))?.id ?? 'session'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'session' ? {} : { tab }, { replace: true })
  }

  // Password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // API key state
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(user?.hasApiKey ?? false)
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState('')

  if (!user) return null

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordLoading(true)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setPasswordSuccess('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      if (err instanceof ApiError) setPasswordError(err.message)
      else setPasswordError('Failed to change password')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleGenerateKey = async () => {
    setKeyError('')
    setKeyLoading(true)
    try {
      const res = await api<ApiKeyResponse>('/api/keys/generate', { method: 'POST' })
      setApiKey(res.apiKey)
      setHasKey(true)
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }

  const handleRevokeKey = async () => {
    if (!confirm('Revoke your API key? The Windower addon will stop syncing.')) return
    setKeyError('')
    setKeyLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      setHasKey(false)
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <UserAvatar username={user.username} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{user.username}</h1>
          <p className="text-gray-400">{user.email}</p>
          {user.oAuthProvider && (
            <p className="text-sm text-gray-500 mt-1">
              Linked with {user.oAuthProvider.charAt(0).toUpperCase() + user.oAuthProvider.slice(1)}
            </p>
          )}
          <p className="text-xs text-gray-600 mt-1">
            Member since {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Session tab */}
      {activeTab === 'session' && (
        <div className="space-y-6">
          {!user.oAuthProvider && (
            <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold mb-4">Change Password</h2>

              {passwordError && (
                <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="mb-4 rounded bg-green-900/50 border border-green-700 p-3 text-sm text-green-300">
                  {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </section>
          )}

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Session</h2>
            <p className="text-sm text-gray-400 mb-4">
              Logging out will clear your session. You will need to sign in again.
            </p>
            <button
              onClick={handleLogout}
              className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30"
            >
              Logout
            </button>
          </section>
        </div>
      )}

      {/* API Keys tab */}
      {activeTab === 'apikeys' && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">Windower API Key</h2>
          <p className="text-sm text-gray-400 mb-4">
            Your API key is used by the Windower addon to sync character data.
            Generating a new key invalidates the previous one.
          </p>

          {keyError && (
            <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
              {keyError}
            </div>
          )}

          {apiKey && (
            <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3">
              <p className="text-xs text-gray-500 mb-1">
                Copy this key now — it won't be shown again.
              </p>
              <code className="text-sm text-green-400 break-all select-all">{apiKey}</code>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerateKey}
              disabled={keyLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {hasKey ? 'Regenerate Key' : 'Generate Key'}
            </button>

            {hasKey && (
              <button
                onClick={handleRevokeKey}
                disabled={keyLoading}
                className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Revoke Key
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
