import { type ReactNode } from 'react'

interface BottomFlyoutProps {
  /** When false, nothing renders. */
  open: boolean
  /** Content of the flyout panel. */
  children: ReactNode
  /**
   * If provided, a click-to-close backdrop is rendered over the content area
   * (never the sidebar). Omit for persistent trays that shouldn't dim the page.
   */
  onClose?: () => void
  /** Extra classes for the panel container (background, max-height, borders, etc.). */
  panelClassName?: string
}

/**
 * Bottom-anchored flyout that respects the sidebar's column.
 *
 * On mobile the sidebar is an off-canvas overlay, so the flyout spans full width.
 * From `lg` up the sidebar is a fixed 256px (`w-64`) column, so the flyout starts
 * at its right edge (`lg:left-64`) and never crosses into it — which also sidesteps
 * any z-index war with the sidebar (see Layout.tsx: sidebar is `z-40`, and content
 * lives in a `z-10` stacking context, so full-width flyouts otherwise render either
 * under or over the sidebar depending on where they mount). Anchoring to the content
 * column makes stacking order irrelevant.
 *
 * This is the shared home for the `w-64` sidebar-width coupling — keep it here.
 */
export default function BottomFlyout({ open, children, onClose, panelClassName = '' }: BottomFlyoutProps) {
  if (!open) return null
  return (
    <>
      {onClose && (
        <div
          className="fixed inset-y-0 left-0 right-0 lg:left-64 z-40 bg-black/50"
          onClick={onClose}
        />
      )}
      <div className={`fixed bottom-0 left-0 right-0 lg:left-64 z-50 ${panelClassName}`}>
        {children}
      </div>
    </>
  )
}
