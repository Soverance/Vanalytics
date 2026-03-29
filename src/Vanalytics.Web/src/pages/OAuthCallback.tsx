import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function OAuthCallback() {
  const { oauthLogin } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const provider = params.get('state')

    if (!code || !provider) {
      navigate('/servers', { replace: true })
      return
    }

    const redirectUri = `${window.location.origin}/oauth/callback`
    oauthLogin(provider, code, redirectUri)
      .then(() => navigate('/characters', { replace: true }))
      .catch((err) => setError(err?.message || 'OAuth login failed. Please try again.'))
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/servers', { replace: true })}
            className="text-blue-400 hover:underline text-sm"
          >
            Return to app
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-gray-400">Signing in...</p>
    </div>
  )
}
