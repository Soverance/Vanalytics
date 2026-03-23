import { Link, type To } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoginModal } from '../context/LoginModalContext'

interface AuthLinkProps {
  to: To
  className?: string
  children: React.ReactNode
}

export default function AuthLink({ to, className, children }: AuthLinkProps) {
  const { user } = useAuth()
  const { open } = useLoginModal()

  if (user) {
    return <Link to={to} className={className}>{children}</Link>
  }

  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  )
}
