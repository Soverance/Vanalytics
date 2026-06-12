import { describe, it, expect } from 'vitest'
import { tokenizeMessageBody, type MessageToken } from './linkifyMessage'

const ORIGIN = 'https://vanalytics.soverance.com'

function links(tokens: MessageToken[]) {
  return tokens.filter((t): t is Extract<MessageToken, { type: 'link' }> => t.type === 'link')
}

describe('tokenizeMessageBody', () => {
  it('returns a single text token when there are no links', () => {
    const tokens = tokenizeMessageBody('just a plain message', ORIGIN)
    expect(tokens).toEqual([{ type: 'text', value: 'just a plain message' }])
  })

  it('renders a relative character-profile path as a friendly internal link', () => {
    const tokens = tokenizeMessageBody('— Applying to MyLS as /Asura/Soverance', ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: '/Asura/Soverance', label: 'Soverance (Asura)', internal: true },
    ])
    // Surrounding text is preserved.
    expect(tokens[0]).toEqual({ type: 'text', value: '— Applying to MyLS as ' })
  })

  it('collapses a same-origin absolute profile URL to an internal path link', () => {
    const tokens = tokenizeMessageBody(`${ORIGIN}/Asura/Soverance`, ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: '/Asura/Soverance', label: 'Soverance (Asura)', internal: true },
    ])
  })

  it('treats a foreign URL as an external link showing the URL', () => {
    const tokens = tokenizeMessageBody('see https://example.com/foo for details', ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: 'https://example.com/foo', label: 'https://example.com/foo', internal: false },
    ])
  })

  it('does not apply the friendly label to reserved app routes', () => {
    const tokens = tokenizeMessageBody('/users/scott', ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: '/users/scott', label: '/users/scott', internal: true },
    ])
  })

  it('decodes URL-encoded profile segments in the label', () => {
    const tokens = tokenizeMessageBody('/Asura/Foo%20Bar', ORIGIN)
    expect(links(tokens)[0].label).toBe('Foo Bar (Asura)')
  })

  it('peels trailing sentence punctuation off the link', () => {
    const tokens = tokenizeMessageBody('look at /Asura/Soverance.', ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: '/Asura/Soverance', label: 'Soverance (Asura)', internal: true },
    ])
    expect(tokens[tokens.length - 1]).toEqual({ type: 'text', value: '.' })
  })

  it('does not treat a mid-word slash as a path', () => {
    const tokens = tokenizeMessageBody('tank and/or healer', ORIGIN)
    expect(links(tokens)).toEqual([])
  })

  it('keeps a 3-segment internal path (e.g. linkshell) as a raw-path link', () => {
    const tokens = tokenizeMessageBody('/Asura/linkshell/MyLS', ORIGIN)
    expect(links(tokens)).toEqual([
      { type: 'link', href: '/Asura/linkshell/MyLS', label: '/Asura/linkshell/MyLS', internal: true },
    ])
  })
})
