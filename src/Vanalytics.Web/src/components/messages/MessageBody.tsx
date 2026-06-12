import { Link } from 'react-router-dom'
import { tokenizeMessageBody } from './linkifyMessage'

// Renders a message body with clickable links. Internal links use react-router
// (SPA navigation); external links open in a new tab. Links inherit the bubble's
// text color and are underlined so they stay legible on both bubble colors.
export default function MessageBody({ body }: { body: string }) {
  const tokens = tokenizeMessageBody(body, window.location.origin)
  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((t, i) => {
        if (t.type === 'text') return <span key={i}>{t.value}</span>
        if (t.internal) {
          return (
            <Link key={i} to={t.href} className="font-medium underline underline-offset-2 hover:opacity-80">
              {t.label}
            </Link>
          )
        }
        return (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            {t.label}
          </a>
        )
      })}
    </span>
  )
}
