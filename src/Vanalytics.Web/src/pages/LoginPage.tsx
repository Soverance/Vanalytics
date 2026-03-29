import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'

const OAUTH_CONFIG = {
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
  },
  microsoft: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    scope: 'openid email profile User.Read',
  },
}

export default function LoginPage() {
  const { user, login, register, oauthLogin } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/characters" replace />

  const handleOAuth = (provider: 'google' | 'microsoft') => {
    const config = OAUTH_CONFIG[provider]
    const redirectUri = `${window.location.origin}/login`
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scope,
      state: provider,
    })
    window.location.href = `${config.authUrl}?${params}`
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const provider = params.get('state')
    if (code && provider) {
      const redirectUri = `${window.location.origin}/login`
      oauthLogin(provider, code, redirectUri)
        .then(() => navigate('/characters'))
        .catch((err) => {
          if (err instanceof ApiError) setError(err.message)
          else setError('OAuth login failed')
        })
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await register({ email, username, password })
      } else {
        await login({ email, password })
      }
      navigate('/characters')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-8">
        <div className="flex items-center justify-center mb-6 min-w-0">
          <img
            src="/vanalytics-square-logo.png"
            alt=""
            className="h-16 w-16 shrink-0 -mr-2"
          />
          <img
            src="/vanalytics-typography-horizontal-logo.png"
            alt="Vana'lytics"
            className="min-w-0 max-w-full"
          />
        </div>
        {isRegister && (
          <h2 className="mb-6 text-2xl font-bold text-center">Create Account</h2>
        )}

        {error && (
          <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-700 pt-4">
          <p className="text-center text-sm text-gray-500 mb-3">Or continue with</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleOAuth('google')}
              className="flex-1 rounded border border-gray-700 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Google
            </button>
            <button
              onClick={() => handleOAuth('microsoft')}
              className="flex-1 rounded border border-gray-700 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
            >
              Microsoft
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="text-blue-400 hover:underline"
          >
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}
