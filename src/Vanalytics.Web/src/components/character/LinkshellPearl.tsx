interface Props {
  /** Packed RGB (r << 16 | g << 8 | b). Falls back to gray when null/undefined. */
  colorRgb?: number | null
  size?: number
  className?: string
  title?: string
}

function toHex(colorRgb?: number | null): string {
  if (colorRgb == null) return '#9ca3af' // gray-400 fallback
  return `#${(colorRgb & 0xffffff).toString(16).padStart(6, '0')}`
}

// A small glossy linkshell pearl, tinted by the linkshell's in-game color.
export default function LinkshellPearl({ colorRgb, size = 14, className, title }: Props) {
  const hex = toHex(colorRgb)
  // Deterministic gradient id per color. Duplicate ids for the same color are
  // harmless — the gradient definition is identical.
  const gradId = `lspearl-${hex.slice(1)}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      role="img"
      aria-label={title ?? 'Linkshell'}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="45%" stopColor={hex} />
          <stop offset="100%" stopColor={hex} />
        </radialGradient>
      </defs>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill={`url(#${gradId})`}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="0.75"
      />
    </svg>
  )
}
