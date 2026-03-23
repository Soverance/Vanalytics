# Server Detail Slide-over Panel

**Date:** 2026-03-23
**Parent feature:** Server Status Analytics Dashboard

## Overview

Replace direct page navigation from the dashboard to per-server detail with a slide-over panel that shows a summary view. The dedicated detail page (`/server/status/:name`) remains for deep dives and shareable URLs.

## Trigger & Affordance

Clicking any server name on the dashboard (heatmap, rankings, status grid) opens the slide-over panel. All server names receive visual affordance: `cursor-pointer`, underline on hover, subtle blue color shift.

## Panel Behavior

- Slides in from the right edge using Tailwind `transition-transform duration-300 ease-out`
- Width: ~50% of viewport on desktop (min 400px), full width on mobile
- Dimmed overlay behind; clicking overlay or pressing Escape closes it
- Body scroll locked while panel is open
- Panel content scrollable if it overflows
- State-driven (no URL change when panel opens)
- Accessible: `role="dialog"`, `aria-modal="true"`, focus trapped within panel while open, focus returns to triggering element on close

## Panel Content (top to bottom)

1. **Header:** Server name, current status dot, uptime %, close button (X)
2. **Time range selector:** Same options as dashboard (24h, 48h, 7d, 30d, 90d, 365d, All). Defaults to the dashboard's current `days` value. Time range changes within the panel are independent — they do not sync back to the dashboard.
3. **Uptime trend chart:** Reuses `UptimeTrendChart` component at reduced height (~200px)
4. **Status timeline bar:** Extract the inline timeline bar from `ServerDetailPage.tsx` into a shared `StatusTimeline` component, used by both the panel and the detail page.
5. **Recent events:** The first 5 entries from the `history` array (which is sorted newest-first by the API). Compact list: status badge, started time, duration. No pagination, no filtering.
6. **"View full history →" link:** Navigates to `/server/status/:name` (the full detail page)

## Loading & Error States

- **Loading:** Spinner centered in the panel body while fetch is in flight. Header shows server name immediately (known from click).
- **Error:** Inline error message in the panel body (e.g., "Failed to load server history"). No redirect.
- **404:** Show "Server not found" message in the panel body.

## Data Source

Uses the existing `GET /api/servers/{name}/history?days=N` endpoint. No backend changes needed.

## Component Changes

| Action | Path | Change |
|--------|------|--------|
| Create | `src/Vanalytics.Web/src/components/server/ServerDetailPanel.tsx` | Slide-over panel component |
| Create | `src/Vanalytics.Web/src/components/server/StatusTimeline.tsx` | Extracted timeline bar, reused by panel and detail page |
| Modify | `src/Vanalytics.Web/src/pages/ServerStatusDashboard.tsx` | Add `selectedServer` state, render panel, pass current `days` |
| Modify | `src/Vanalytics.Web/src/pages/ServerDetailPage.tsx` | Replace inline timeline bar with `StatusTimeline` component |
| Modify | `src/Vanalytics.Web/src/components/server/ServerHeatmap.tsx` | Replace `navigate()` with `onServerClick` callback prop |
| Modify | `src/Vanalytics.Web/src/components/server/ServerRankings.tsx` | Replace `navigate()` with `onServerClick` callback prop |
| Modify | `src/Vanalytics.Web/src/components/server/CurrentStatusGrid.tsx` | Replace `navigate()` with `onServerClick` callback prop |

## Callback Prop Interface

All three child components (heatmap, rankings, status grid) receive the same callback:

```typescript
onServerClick: (serverName: string) => void
```

The dashboard supplies the current `days` value to the panel — child components do not need to pass it.

## Interaction Flow

1. User clicks server name in heatmap/rankings/status grid
2. Child component calls `onServerClick(serverName)`
3. Dashboard sets `selectedServer` state to that server's name
4. `ServerDetailPanel` renders as a slide-over, fetches history data
5. User can change time range within the panel (independent of dashboard)
6. User can click "View full history →" to navigate to the full detail page
7. User can click overlay, press Escape, or click X to close
8. Dashboard clears `selectedServer` state, focus returns to the element that was clicked

## Visual Affordance on Server Names

All three components (heatmap, rankings, status grid) update their server name rendering:
- Text color: `text-gray-400` → `text-blue-400` on hover
- Text decoration: underline on hover
- Cursor: pointer (already present on buttons, ensure consistent)
