# Sidebar Accordion Navigation Design

## Problem

The sidebar navigation in Vanalytics is becoming cluttered as new pages are added. A flat list of 8+ nav items (plus admin links) doesn't scale and makes discovery harder as the app grows.

## Solution

Replace the flat nav list with a collapsible accordion system that groups related pages into sections. Top-level items that don't need children remain as direct links.

## Navigation Structure

```
Dashboard          (direct link → /dashboard)
Characters         (direct link → /characters)
Database           (section toggle)
  ├─ Items         → /items
  └─ NPCs          → /npcs
Economy            (section toggle)
  └─ Bazaar        → /bazaar
Server             (section toggle)
  ├─ Status        → /servers
  └─ Clock         → /clock
Setup Guide        (direct link → /setup)
─────────────────
Admin              (section toggle, admin-only)
  ├─ Users         → /admin/users
  ├─ Data          → /admin/data
  └─ SAML          → /admin/saml
```

## Behavior

- **Single-open accordion**: only one section can be expanded at a time. Expanding a section collapses the previously open one.
- **URL-driven expansion**: the section containing the active route auto-expands on navigation. No persisted state (no localStorage).
- **Direct links collapse**: clicking Dashboard, Characters, or Setup Guide collapses any open section.
- **Section headers are toggles only**: clicking Server, Economy, Database, or Admin expands/collapses the section but does not navigate to a page.
- **Chevron indicator**: section headers show a chevron that rotates on expand/collapse.
- **Smooth animation**: expand/collapse uses Tailwind CSS transitions for height or max-height.
- **Mobile behavior**: unchanged — sidebar remains a slide-in drawer on mobile. Accordion behavior applies identically within the drawer.

## Route-to-Section Mapping

| Route prefix | Section |
|---|---|
| `/items`, `/npcs` | Database |
| `/bazaar` | Economy |
| `/servers`, `/clock` | Server |
| `/admin/*` | Admin |
| all others | no section (direct links) |

Note: `/items/:id` (Item Detail) should expand the Database section. `/characters/:id` has no section since Characters is a direct link. Routes without sidebar links (`/profile`, `/debug/models`) result in no section expanded and no sidebar item highlighted — this is expected. The user profile footer link at the bottom of the sidebar is unaffected by accordion behavior.

## Component Design

All changes are scoped to `Layout.tsx`.

### New: `SidebarSection` component

A small component defined inside `Layout.tsx` (alongside the existing `SidebarLink`):

```
Props:
  - label: string (display name)
  - icon: ReactNode (Lucide icon)
  - isOpen: boolean
  - onToggle: () => void
  - children: ReactNode (child SidebarLink items)
```

Renders:
- A clickable header row with icon, label, and animated chevron
- A collapsible container for children with height transition
- Header styling matches existing nav items but is not a NavLink (no active state, no navigation)

### State Management

In `LayoutInner`:
- Derive `openSection` from `useLocation().pathname` via a helper function that maps routes to section names
- When a section header is clicked: if already open, close it (set to null); otherwise open it
- When a direct link is clicked: section state resets on next render via the URL-driven derivation
- Use `useEffect` on pathname to sync `openSection` when navigating via browser back/forward

### Active State on Child Routes

The existing `SidebarLink` uses the `end` prop on `NavLink`, which prevents active styling on sub-routes (e.g., `/items` won't highlight on `/items/123`). Remove the `end` prop from links that have child routes (`/items`) so they remain highlighted when viewing detail pages.

### Mobile Sidebar Close

The current `<nav>` has an `onClick` handler that closes the mobile sidebar. With section headers added as non-navigating buttons inside `<nav>`, clicking a header would incorrectly close the drawer. Fix by calling `stopPropagation()` on section header clicks, or moving the close handler to individual `SidebarLink` components instead of the parent `<nav>`.

### Accessibility

- Section header buttons: use `aria-expanded` to indicate open/closed state
- Collapsible regions: use `role="region"` with `aria-labelledby` pointing to the header
- Section headers must be focusable (`<button>`) and toggle on Enter/Space (native behavior if using `<button>`)

### Icon Assignments

| Item | Icon | Notes |
|---|---|---|
| Dashboard | `LayoutDashboard` | unchanged |
| Characters | `Swords` | unchanged |
| Database | `Database` | section header (was used for Admin Data) |
| Items | `Package` | unchanged |
| NPCs | `Bug` | unchanged |
| Economy | `Store` | section header (was used for Bazaar) |
| Bazaar | `Store` | child — may want a different icon to avoid duplication |
| Server | `Radio` | section header (was used for Server Status) |
| Status | `Radio` | child — same duplication concern |
| Clock | `Clock` | unchanged |
| Setup Guide | `BookOpen` | unchanged |
| Admin | `ShieldCheck` | section header, unchanged |
| Users | `Users` | unchanged |
| Data | `Database` | child — duplicates section header icon |
| SAML | `KeyRound` | unchanged |

Icon duplication between section headers and their children is acceptable for now since headers and children are visually distinct. Can be revisited later if desired.

### Styling

- Section headers: same padding/font as `SidebarLink` but with `cursor-pointer` and no NavLink active state
- Child links: indented with `pl-10` (or similar) to visually nest under the header
- Chevron: `ChevronRight` from Lucide, `h-4 w-4`, rotated 90deg when open via `rotate-90` with `transition-transform duration-200`
- Collapse animation: use `overflow-hidden` with `max-height` transition or `grid-template-rows` trick for smooth expand/collapse
- All existing color tokens (gray-400, gray-800, etc.) remain unchanged

## Files Modified

- `Layout.tsx` — add `SidebarSection` component, refactor nav section to use accordion structure, add `openSection` state logic

No new files required.

## Out of Scope

- Persisting open section state across sessions
- Section headers as navigable pages
- Multiple simultaneously open sections
- Changes to routing or page components
- Changes to mobile hamburger/drawer behavior beyond accordion within the drawer
