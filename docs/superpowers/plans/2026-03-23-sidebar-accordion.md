# Sidebar Accordion Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat sidebar nav in Layout.tsx with a collapsible accordion that groups related pages into sections.

**Architecture:** Add a `SidebarSection` component alongside the existing `SidebarLink` in Layout.tsx. A `getSection()` helper maps pathnames to section names. A single `openSection` state (synced to the current URL) controls which section is expanded. Only one section can be open at a time.

**Tech Stack:** React 19, React Router 7, Tailwind CSS v4, Lucide React icons

**Spec:** `docs/superpowers/specs/2026-03-23-sidebar-accordion-design.md`

---

### Task 1: Add `getSection` helper and `ChevronRight` import

**Files:**
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx:1-12`

- [ ] **Step 1: Add `useLocation` and `useEffect` to the React import**

Change line 1 from:
```tsx
import { useState, type ReactNode } from 'react'
```
to:
```tsx
import { useState, useEffect, type ReactNode } from 'react'
```

- [ ] **Step 2: Add `useLocation` to the router import**

Change line 2 from:
```tsx
import { Link, NavLink, Outlet } from 'react-router-dom'
```
to:
```tsx
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
```

- [ ] **Step 3: Add `ChevronRight` to the Lucide import**

Change line 7 from:
```tsx
import { LayoutDashboard, Swords, Menu, ShieldCheck, Users, BookOpen, Radio, Package, Store, Database, Clock, KeyRound, Bug } from 'lucide-react'
```
to:
```tsx
import { LayoutDashboard, Swords, Menu, ShieldCheck, Users, BookOpen, Radio, Package, Store, Database, Clock, KeyRound, Bug, ChevronRight } from 'lucide-react'
```

- [ ] **Step 4: Add `getSection` helper after imports (after line 12)**

Insert after the last import statement:

```tsx
type SectionName = 'database' | 'economy' | 'server' | 'admin'

function getSection(pathname: string): SectionName | null {
  if (pathname.startsWith('/items') || pathname.startsWith('/npcs')) return 'database'
  if (pathname.startsWith('/bazaar')) return 'economy'
  if (pathname.startsWith('/servers') || pathname.startsWith('/clock')) return 'server'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}
```

---

### Task 2: Add `SidebarSection` component

**Files:**
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx` (after the existing `SidebarLink` component, before `Layout`)

- [ ] **Step 1: Add `SidebarSection` component after `SidebarLink` (after line 31)**

Insert after the closing `}` of `SidebarLink`:

```tsx
function SidebarSection({
  label,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  label: string
  icon: ReactNode
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const id = `sidebar-section-${label.toLowerCase()}`
  const btnId = `${id}-btn`
  return (
    <div>
      <button
        id={btnId}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-expanded={isOpen}
        aria-controls={id}
        className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-200 cursor-pointer"
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={btnId}
        className={`overflow-hidden transition-[grid-template-rows] duration-200 grid ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0">
          <div className="space-y-1 py-1 pl-7">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 3: Add accordion state to `LayoutInner` and refactor nav

**Files:**
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx:41-99`

- [ ] **Step 1: Add `openSection` state and URL sync in `LayoutInner`**

After line 44 (`const { isOpen: loginOpen, close: closeLogin } = useLoginModal()`), add:

```tsx
  const { pathname } = useLocation()
  const [openSection, setOpenSection] = useState<SectionName | null>(() => getSection(pathname))

  useEffect(() => {
    setOpenSection(getSection(pathname))
  }, [pathname])

  const toggleSection = (section: SectionName) => {
    setOpenSection((prev) => (prev === section ? null : section))
  }
```

- [ ] **Step 2: Replace the nav links section (lines 78-98)**

Replace the entire `<nav>` content (lines 78-98) with:

```tsx
        <nav className="flex-1 space-y-1 px-3 py-4">
          <SidebarLink to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          <SidebarLink to="/characters" label="Characters" icon={<Swords className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          <SidebarSection label="Database" icon={<Database className="h-4 w-4 shrink-0" />} isOpen={openSection === 'database'} onToggle={() => toggleSection('database')}>
            <SidebarLink to="/items" end={false} label="Items" icon={<Package className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/npcs" label="NPCs" icon={<Bug className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Economy" icon={<Store className="h-4 w-4 shrink-0" />} isOpen={openSection === 'economy'} onToggle={() => toggleSection('economy')}>
            <SidebarLink to="/bazaar" label="Bazaar" icon={<Store className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarSection label="Server" icon={<Radio className="h-4 w-4 shrink-0" />} isOpen={openSection === 'server'} onToggle={() => toggleSection('server')}>
            <SidebarLink to="/servers" label="Status" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            <SidebarLink to="/clock" label="Clock" icon={<Clock className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
          </SidebarSection>

          <SidebarLink to="/setup" label="Setup Guide" icon={<BookOpen className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />

          {user?.role === 'Admin' && (
            <SidebarSection label="Admin" icon={<ShieldCheck className="h-4 w-4 shrink-0" />} isOpen={openSection === 'admin'} onToggle={() => toggleSection('admin')}>
              <SidebarLink to="/admin/users" label="Users" icon={<Users className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/data" label="Data" icon={<Database className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
              <SidebarLink to="/admin/saml" label="SAML" icon={<KeyRound className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
            </SidebarSection>
          )}
        </nav>
```

Note: This removes the `onClick={() => setSidebarOpen(false)}` from the `<nav>` element and moves it to each `SidebarLink`. This prevents section header clicks from closing the mobile drawer.

- [ ] **Step 3: Update `SidebarLink` to accept and call `onClick`**

Change the `SidebarLink` component (lines 14-31) to:

```tsx
function SidebarLink({ to, label, icon, end = true, onClick }: { to: string; label: string; icon: ReactNode; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
```

Key changes:
- Added optional `onClick` prop (for mobile sidebar close)
- Made `end` an optional prop defaulting to `true` (preserves existing exact-match behavior)
- Pass `end={false}` only on `/items` so it stays highlighted on `/items/:id` detail pages

---

### Task 4: Verify in browser

- [ ] **Step 1: Run the dev server**

Run: `cd src/Vanalytics.Web && npm run dev`

- [ ] **Step 2: Verify accordion behavior**

Check the following in the browser:
1. Dashboard and Characters are direct links (no chevron, no accordion)
2. Database, Economy, Server show chevrons and expand/collapse on click
3. Only one section open at a time — opening a new section closes the previous
4. Navigating to `/items` auto-expands the Database section
5. Navigating to `/items/:id` (click an item) keeps Database section expanded and Items link highlighted
6. Clicking Dashboard collapses any open section
7. Admin section only visible when logged in as Admin
8. Mobile: section headers don't close the drawer, only link clicks do
9. Chevrons animate smoothly on expand/collapse
10. Child links are visually indented under section headers

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/Layout.tsx
git commit -m "feat: add collapsible accordion navigation to sidebar"
```
