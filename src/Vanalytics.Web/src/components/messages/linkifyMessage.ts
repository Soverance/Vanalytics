// Turns a plain-text message body into a token stream of text + links, so the
// conversation view can render clickable links safely (React nodes — never
// dangerouslySetInnerHTML). Pure and origin-injected so it's unit-testable
// without a DOM.

export type MessageToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string; internal: boolean }

// Two-segment paths whose first segment is one of these are app routes, NOT a
// character profile (`/:server/:name`), so they keep the raw path as their
// label instead of the friendly "{name} ({server})" form.
const RESERVED_FIRST_SEGMENTS = new Set([
  'users', 'messages', 'linkshells', 'players', 'forum', 'items', 'recipes',
  'npcs', 'zones', 'server', 'servers', 'clock', 'characters', 'profile',
  'admin', 'sessions', 'debug', 'setup', 'oauth', 'login',
])

// Trailing punctuation that almost always belongs to the sentence, not the
// link (e.g. "see /Asura/Soverance." or "(/Asura/Soverance)").
const TRAILING_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', ')'])

// Matches an absolute http(s) URL or a root-relative path, anchored to a
// word boundary so mid-word slashes (and/or) aren't treated as paths.
const LINK_RE = /(?<=^|\s)(https?:\/\/[^\s]+|\/[^\s]+)/g

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// Friendly label for an internal path: a character profile (`/{server}/{name}`)
// becomes "{name} ({server})"; anything else keeps the raw path.
function labelForPath(path: string): string {
  const clean = path.split(/[?#]/)[0]
  const segments = clean.split('/').filter(Boolean)
  if (segments.length === 2 && !RESERVED_FIRST_SEGMENTS.has(safeDecode(segments[0]).toLowerCase())) {
    return `${safeDecode(segments[1])} (${safeDecode(segments[0])})`
  }
  return path
}

// Classify one matched substring. Same-origin absolute URLs collapse to an
// internal path link; other absolute URLs are external; root-relative paths
// are internal. Returns null if it can't be parsed as a usable link.
function classify(raw: string, origin: string): Extract<MessageToken, { type: 'link' }> | null {
  if (raw.startsWith('http')) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    if (url.origin === origin) {
      const path = url.pathname + url.search
      return { type: 'link', href: path, label: labelForPath(path), internal: true }
    }
    return { type: 'link', href: raw, label: raw, internal: false }
  }
  // Root-relative path.
  return { type: 'link', href: raw, label: labelForPath(raw), internal: true }
}

export function tokenizeMessageBody(text: string, origin: string): MessageToken[] {
  const tokens: MessageToken[] = []
  let lastIndex = 0

  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index
    const fullMatch = match[1]

    // Peel trailing sentence punctuation off the matched link.
    let raw = fullMatch
    let trailing = ''
    while (raw.length > 0 && TRAILING_PUNCTUATION.has(raw[raw.length - 1])) {
      trailing = raw[raw.length - 1] + trailing
      raw = raw.slice(0, -1)
    }

    if (start > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, start) })
    }

    const link = raw.length > 0 ? classify(raw, origin) : null
    if (link) {
      tokens.push(link)
    } else {
      tokens.push({ type: 'text', value: raw })
    }
    if (trailing) {
      tokens.push({ type: 'text', value: trailing })
    }

    lastIndex = start + fullMatch.length
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return tokens
}
