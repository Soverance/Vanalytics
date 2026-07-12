import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../api/client'
import UserAvatar from '../components/UserAvatar'
import type { ApiKeyResponse, GameServer } from '../types/api'
import { useFfxiFileSystem } from '../context/FfxiFileSystemContext'
import { Copy, Check } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import Tabs from '../components/Tabs'

type Tab = 'session' | 'preferences' | 'apikeys'

const tabs: { id: Tab; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'apikeys', label: 'API Keys' },
]

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const ffxi = useFfxiFileSystem()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = tabs.find(t => t.id === searchParams.get('tab'))?.id ?? 'session'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setApiKey(null)
    setCopied(false)
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
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [copied, setCopied] = useState(false)

  // Server preference state
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedDefaultServer, setSelectedDefaultServer] = useState(user?.defaultServer ?? '')
  const [serverSaving, setServerSaving] = useState(false)
  const [serverSaved, setServerSaved] = useState(false)

  // Display name state
  const [displayNameInput, setDisplayNameInput] = useState(user?.displayName ?? '')
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [displayNameSaved, setDisplayNameSaved] = useState(false)
  const [displayNameError, setDisplayNameError] = useState('')

  // FFXI setup state
  const [ffxiSetupError, setFfxiSetupError] = useState<'blocked' | 'invalid' | 'error' | null>(null)
  const [ffxiErrorDetail, setFfxiErrorDetail] = useState<string | null>(null)

  const handleConfigureFfxi = async () => {
    setFfxiSetupError(null)
    setFfxiErrorDetail(null)
    const result = await ffxi.configure()
    if (result.status === 'ok' || result.status === 'cancelled') return
    setFfxiSetupError(result.status)
    if (result.status === 'error') setFfxiErrorDetail(result.message)
  }

  useEffect(() => {
    fetch('/api/servers')
      .then(r => r.ok ? r.json() : [])
      .then((s: GameServer[]) => setServers(s))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedDefaultServer(user?.defaultServer ?? '')
  }, [user?.defaultServer])

  useEffect(() => {
    setDisplayNameInput(user?.displayName ?? '')
  }, [user?.displayName])

  const handleSaveServer = async () => {
    setServerSaving(true)
    setServerSaved(false)
    try {
      await api('/api/auth/me/server', {
        method: 'PUT',
        body: JSON.stringify({ server: selectedDefaultServer || null }),
      })
      await refreshUser()
      setServerSaved(true)
      setTimeout(() => setServerSaved(false), 2000)
    } catch {
      // silently fail
    } finally {
      setServerSaving(false)
    }
  }

  const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 _\-.'\[\]]+$/

  const handleSaveDisplayName = async () => {
    const trimmed = displayNameInput.trim()
    setDisplayNameError('')

    if (trimmed.length > 0) {
      if (trimmed.length < 3 || trimmed.length > 24) {
        setDisplayNameError('Display name must be 3–24 characters.')
        return
      }
      if (!DISPLAY_NAME_PATTERN.test(trimmed)) {
        setDisplayNameError("Only letters, numbers, spaces, and _ - . ' [ ] are allowed.")
        return
      }
    }

    setDisplayNameSaving(true)
    setDisplayNameSaved(false)
    try {
      await api('/api/auth/me/display-name', {
        method: 'PUT',
        body: JSON.stringify({ displayName: trimmed || null }),
      })
      await refreshUser()
      setDisplayNameSaved(true)
      setTimeout(() => setDisplayNameSaved(false), 2000)
    } catch (e) {
      setDisplayNameError(e instanceof ApiError ? e.message : 'Could not save display name.')
    } finally {
      setDisplayNameSaving(false)
    }
  }

  const handleCopyKey = useCallback(() => {
    if (!apiKey) return
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [apiKey])

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
      refreshUser().catch(() => {})
    } catch (err) {
      if (err instanceof ApiError) setKeyError(err.message)
    } finally {
      setKeyLoading(false)
    }
  }

  const handleRevokeKey = async () => {
    setKeyError('')
    setKeyLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      refreshUser().catch(() => {})
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
        <UserAvatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{user.displayName ?? user.username}</h1>
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

      <Tabs
        items={tabs.map(t => ({ value: t.id, label: t.label }))}
        value={activeTab}
        onChange={handleTabChange}
      />

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

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Delete Account</h2>
            <p className="text-sm text-gray-400 mb-4">
              Per our{' '}
              <a
                href="https://soverance.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                privacy policy
              </a>
              , account deletion is handled manually. The button below opens your email client with a pre-filled
              request. Once received, your account and all associated character data are permanently removed.
            </p>
            <a
              href={`mailto:scott@soverance.com?subject=${encodeURIComponent('Vanalytics account deletion request')}&body=${encodeURIComponent(
                [
                  'Hello,',
                  '',
                  'Please delete my Vanalytics account and all associated data.',
                  '',
                  `Username: ${user.username}`,
                  `Email: ${user.email}`,
                ].join('\n')
              )}`}
              className="inline-block rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30"
            >
              Request Account Deletion
            </a>
          </section>
        </div>
      )}

      {/* Preferences tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-1">Display Name</h2>
            <p className="text-sm text-gray-500 mb-4">
              The name shown for you across the site — in the forum, on your profile, and in the nav.
              Leave it blank to fall back to your <span className="text-gray-400">@{user.username}</span> handle.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => { setDisplayNameInput(e.target.value); setDisplayNameError('') }}
                maxLength={24}
                placeholder={user.username}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 flex-1"
              />
              <button
                onClick={handleSaveDisplayName}
                disabled={displayNameSaving || displayNameInput.trim() === (user.displayName ?? '')}
                className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {displayNameSaving ? 'Saving...' : displayNameSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
            {displayNameError && (
              <p className="mt-2 text-sm text-red-400">{displayNameError}</p>
            )}
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-1">Default Server</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your home server is used as the default selection for bazaar activity, price history, and other server-specific views.
            </p>
            <div className="flex items-center gap-3">
              <select
                value={selectedDefaultServer}
                onChange={(e) => setSelectedDefaultServer(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 flex-1"
              >
                <option value="">None (use first available)</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleSaveServer}
                disabled={serverSaving || selectedDefaultServer === (user?.defaultServer ?? '')}
                className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                {serverSaving ? 'Saving...' : serverSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-4">FFXI Installation</h2>

            {!ffxi.isSupported ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">
                  The 3D model viewer requires a Chromium-based browser (Chrome or Edge) with support for the{' '}
                  <a href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    File System Access API
                  </a>.
                </p>
                <p className="text-xs text-gray-600">
                  Your current browser does not support this feature.
                </p>
              </div>
            ) : !ffxi.isConfigured ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Connect your local FFXI installation to enable the 3D character model viewer.
                  Files are read locally and never uploaded.
                </p>

                <div className="rounded bg-amber-900/30 border border-amber-700/50 p-3 text-xs text-amber-200 space-y-2">
                  <p className="font-medium text-amber-100">
                    Heads up: Chrome and Edge block any folder that resolves to inside <code className="px-1 rounded bg-amber-950/60">C:\Program Files</code> or <code className="px-1 rounded bg-amber-950/60">C:\Program Files (x86)</code>.
                  </p>
                  <p>
                    If your FFXI install is there (the default), the picker shows <em>"can't open this folder because it contains system files"</em>.
                  </p>
                  <p className="rounded bg-amber-950/40 border border-amber-700/40 p-2">
                    ⚠️ A symlink or shortcut <span className="whitespace-nowrap">(<code className="px-1 rounded bg-amber-950/60">mklink /D</code>)</span> won't get around this — Chrome and Edge follow the link to its real target, so one pointing back into Program Files is blocked just the same.
                  </p>
                  <p>
                    <span className="font-medium text-amber-100">The reliable fix</span> is to copy the game's data files out of Program Files: copy the <code className="px-1 rounded bg-amber-950/60">ROM</code>, <code className="px-1 rounded bg-amber-950/60">ROM2</code>–<code className="px-1 rounded bg-amber-950/60">ROM9</code> folders plus the <code className="px-1 rounded bg-amber-950/60">VTABLE.DAT</code> and <code className="px-1 rounded bg-amber-950/60">FTABLE.DAT</code> files into a folder outside Program Files (e.g. <code className="px-1 rounded bg-amber-950/60">C:\FFXI-Data</code>), then browse to that folder below.
                  </p>
                  <p>
                    If your install already lives outside Program Files but at an awkward path, a junction to it works fine — just don't point it into Program Files:
                  </p>
                  <pre className="mt-1 p-2 bg-black/40 rounded text-[11px] text-amber-100 overflow-x-auto"><code>mklink /J C:\FFXI-Link "D:\Games\PlayOnline\SquareEnix\FINAL FANTASY XI"</code></pre>
                </div>

                {ffxiSetupError === 'blocked' && (
                  <div className="rounded bg-red-900/40 border border-red-700/60 p-3 text-sm text-red-200">
                    Windows blocked access to that folder. See the workaround above — FFXI must be accessed from a location outside <code className="px-1 rounded bg-red-950/60">C:\Program Files</code>. If you picked a shortcut, symlink, or junction, note the browser follows it to the real folder and applies the same block.
                  </div>
                )}
                {ffxiSetupError === 'invalid' && (
                  <div className="rounded bg-red-900/40 border border-red-700/60 p-3 text-sm text-red-200">
                    That folder doesn't look like an FFXI installation. Expected to find <code className="px-1 rounded bg-red-950/60">ROM</code>, <code className="px-1 rounded bg-red-950/60">ROM2</code>, and <code className="px-1 rounded bg-red-950/60">VTABLE.DAT</code> inside. Pick the FFXI root folder (the one directly containing those).
                  </div>
                )}
                {ffxiSetupError === 'error' && (
                  <div className="rounded bg-red-900/40 border border-red-700/60 p-3 text-sm text-red-200">
                    Something went wrong connecting to that folder.{ffxiErrorDetail ? ` Details: ${ffxiErrorDetail}` : ''}
                  </div>
                )}

                <button
                  onClick={handleConfigureFfxi}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg"
                >
                  Browse for FFXI Installation
                </button>
                <p className="text-xs text-gray-600">
                  This setting is stored in your browser and shared across all accounts — it points to your local FFXI installation.
                  Requires a Chromium-based browser (Chrome or Edge) with{' '}
                  <a href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    File System Access API
                  </a>{' '}support.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <p className="text-xs text-gray-500 mb-1">Connected</p>
                  <p className="text-sm text-gray-300 break-all">{ffxi.path}</p>
                </div>
                <div className="flex items-center gap-3">
                  {ffxi.isAuthorized ? (
                    <span className="px-2 py-1 text-xs rounded bg-green-900/40 text-green-400 border border-green-800/40">
                      Authorized
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-yellow-900/40 text-yellow-400 border border-yellow-800/40">
                      Needs Permission
                    </span>
                  )}
                  <button
                    onClick={() => ffxi.disconnect()}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Disconnect
                  </button>
                </div>
                <p className="text-xs text-gray-600">
                  This setting is shared across all accounts on this browser — it points to your local FFXI installation, which is the same regardless of which account you're signed into.
                  Requires a Chromium-based browser (Chrome or Edge) with{' '}
                  <a href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_API" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    File System Access API
                  </a>{' '}support.
                </p>
              </div>
            )}
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
              <div className="flex items-start gap-2">
                <code className="text-sm text-green-400 break-all select-all flex-1">{apiKey}</code>
                <button
                  onClick={handleCopyKey}
                  className="shrink-0 text-gray-400 hover:text-white transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {!apiKey && user.hasApiKey && (
            <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-300">
                Active — created on{' '}
                {user.apiKeyCreatedAt
                  ? new Date(user.apiKeyCreatedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'unknown date'}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerateKey}
              disabled={keyLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {apiKey || user.hasApiKey ? 'Regenerate Key' : 'Generate Key'}
            </button>

            {(apiKey || user.hasApiKey) && (
              <button
                onClick={() => setShowRevokeConfirm(true)}
                disabled={keyLoading}
                className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Revoke Key
              </button>
            )}
          </div>
        </section>
      )}

      {showRevokeConfirm && (
        <ConfirmModal
          message="Revoke your API key? The Windower addon will stop syncing."
          confirmLabel="Revoke"
          onConfirm={() => { handleRevokeKey(); setShowRevokeConfirm(false) }}
          onCancel={() => setShowRevokeConfirm(false)}
        />
      )}
    </div>
  )
}
