# Auto-Registration, Licensing Removal, and Page Restructure

**Date:** 2026-03-22

## Overview

Three interconnected changes to simplify the Vanalytics onboarding flow and page access model:

1. Auto-register characters on first addon sync (remove manual registration)
2. Remove the licensing feature entirely (avoid gating content behind paywalls for a Square Enix IP)
3. Restructure page access so everything except a landing page and public character profiles requires login

## 1. Auto-Registration on Sync

### Current flow
1. User registers on web app
2. User manually creates a character entry (name + server) on `/characters`
3. User generates API key, configures addon
4. Addon syncs — API looks up character by name+server, returns 404 if not found

### New flow
1. User registers on web app
2. User generates API key, configures addon
3. Addon syncs — API looks up character by name+server:
   - **Found, owned by this user**: update as normal
   - **Found, owned by different user**: return 403 (prevents hijacking)
   - **Not found**: auto-create `Character` record under authenticated user, then update

### Auto-create defaults
- `IsPublic = false`
- `CreatedAt = DateTimeOffset.UtcNow`
- `UpdatedAt = DateTimeOffset.UtcNow`

### Concurrency handling
The `Characters` table has a unique index on `(Name, Server)`. If two simultaneous sync requests try to create the same character, the second insert will throw a `DbUpdateException`. Handle this with a catch-and-retry: on unique constraint violation, re-read the character and proceed with the normal update path (verifying ownership).

### API changes

**SyncController (`POST /api/sync`)**:
- Remove 404 "character not found" path
- Remove license status check
- Add find-or-create logic: if character doesn't exist, create it with the authenticated user's ID
- On unique constraint violation during create, re-read and verify ownership
- If character exists but belongs to another user, return 403

**CharactersController**:
- Remove `POST /api/characters` (create endpoint) — characters are only created via sync
- Keep `GET /api/characters` (list user's characters)
- Keep `GET /api/characters/{id}` (character detail)
- Keep `PUT /api/characters/{id}` (toggle public visibility)
- Keep `DELETE /api/characters/{id}` (delete character)

**DTOs**:
- Remove `CreateCharacterRequest` (`src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs`)
- Remove `CreateCharacterRequest` and `UpdateCharacterRequest` from frontend types (`src/Vanalytics.Web/src/types/api.ts`)

## 2. Remove Licensing

### Backend
- Remove `LicenseStatus` enum (`src/Vanalytics.Core/Enums/LicenseStatus.cs`)
- Remove `LicenseStatus` property from `Character` model (`src/Vanalytics.Core/Models/Character.cs`)
- Remove `LicenseStatus` configuration from `CharacterConfiguration.cs` (`src/Vanalytics.Data/Configurations/CharacterConfiguration.cs` lines 16-19)
- Remove `LicenseStatus` from `CharacterSummaryResponse` and `CharacterDetailResponse` DTOs
- Remove license check from `SyncController`
- Remove `LicenseStatus` references from `CharactersController` response mappings
- DB migration to drop the `LicenseStatus` column from `Characters` table

### Frontend
- Remove `licenseStatus` from `CharacterSummary` and `CharacterDetail` TypeScript types
- Remove "Licensing" tab from `ProfilePage`
- Remove licensing troubleshooting entry from `SetupGuidePage`
- Remove license status badge from `CharacterCard` component (lines 23-31)
- Remove license status badge from `CharacterDetailPage` (lines 33-41)

## 3. Page Access Restructure

### Public pages (no auth required)
- `/` — New landing page (outside sidebar layout), component: `LandingPage.tsx`
- `/:server/:name` — Public character profiles (shareable growth links)

### Protected pages (auth required, sidebar layout)
- `/dashboard` — User dashboard
- `/characters` — Character list (auto-populated via sync)
- `/characters/:id` — Character detail
- `/profile` — User profile
- `/servers` — Server status
- `/items` — Item database
- `/items/:id` — Item detail
- `/bazaar` — Bazaar activity
- `/clock` — Vana'diel clock
- `/setup` — Setup guide
- `/admin/*` — Admin pages

**Breaking change**: Server Status, Item Database, Bazaar Activity, Clock, and Setup Guide are currently public and will now require login. Unauthenticated visitors will only see the landing page or public character profiles.

### Routing changes
- Root `/` renders `LandingPage` outside the sidebar `Layout` (not inside `<Route element={<Layout />}>`)
- All non-public routes inside `Layout` are wrapped in `ProtectedRoute`
- Public profile route `/:server/:name` remains outside Layout and auth gate
- Remove the current `<Navigate to="/servers" replace />` for root
- Sidebar logo links to `/dashboard` (for logged-in users inside the sidebar layout)

### ProtectedRoute behavior
When an unauthenticated user hits a protected route, `ProtectedRoute` redirects to `/` (the landing page). The landing page has a prominent sign-in CTA. This is simpler than opening a modal on an empty page.

### Sidebar changes
Since all sidebar pages require login, the sidebar always has a logged-in user. Remove the conditional `{user && ...}` guard around Dashboard/Characters links — all nav items are always visible. Remove the "Sign In" button from the sidebar footer (unreachable in the new model).

### Landing page (`LandingPage.tsx`)
- Standalone page outside the sidebar layout
- Explains what Vanalytics is: FFXI character tracking, item database, economy data, server status
- Prominent sign-in / create account CTA that opens the login modal
- Simple, focused — not a full marketing site
- Wrapped in `LoginModalProvider` so the CTA can open the modal

## 4. Setup Guide Updates

- Remove Step 2 ("Register Your Character") — no longer needed
- Remove licensing troubleshooting entry
- Remove "Character not found" troubleshooting entry (no longer possible with auto-registration)
- Renumber remaining steps (1: Install Windower, 2: Generate API Key, 3: Install Addon, 4: Configure API Key, 5: Load Addon, 6: Verify Sync)

## 5. CharactersPage Updates

- Remove the create character form (name input, server dropdown, "Add Character" button)
- Add an informational message: "Characters are automatically added when your Windower addon syncs."
- Keep the character list, public toggle, and delete functionality

## Migration Notes

- A new EF Core migration is needed to drop the `LicenseStatus` column
- Existing characters will continue to work — the license check removal means all existing characters become syncable
- No data loss — character records and their associated jobs/gear/crafting data are unaffected

## Route Collision Note

The `/:server/:name` catch-all pattern could theoretically collide with future top-level routes if a server name matches a route (e.g., "admin"). This is a pre-existing concern. Mitigation: all app routes are defined before the catch-all in react-router, so explicit routes take priority.
