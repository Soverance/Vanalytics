# Auto-Registration, Licensing Removal, and Page Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify onboarding by auto-registering characters on sync, remove licensing, and restructure pages so everything except a landing page and public profiles requires login.

**Architecture:** The sync endpoint gains find-or-create logic. LicenseStatus is stripped from model, DTOs, config, and UI. All routes except `/` and `/:server/:name` move behind ProtectedRoute, which redirects unauthenticated users to a new landing page.

**Tech Stack:** .NET 10, EF Core 10, React 19, react-router-dom, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-auto-registration-licensing-removal-page-restructure-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/Vanalytics.Core/Models/Character.cs` | Remove LicenseStatus property |
| Delete | `src/Vanalytics.Core/Enums/LicenseStatus.cs` | Enum no longer needed |
| Delete | `src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs` | Manual creation removed |
| Modify | `src/Vanalytics.Core/DTOs/Characters/CharacterSummaryResponse.cs` | Remove LicenseStatus field |
| Modify | `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs` | Remove LicenseStatus field |
| Modify | `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs` | Remove LicenseStatus config |
| Create | Migration via `dotnet ef` | Drop LicenseStatus column |
| Modify | `src/Vanalytics.Api/Controllers/SyncController.cs` | Find-or-create logic, remove license check |
| Modify | `src/Vanalytics.Api/Controllers/CharactersController.cs` | Remove POST create, remove license refs |
| Modify | `src/Vanalytics.Web/src/types/api.ts` | Remove license/create types |
| Modify | `src/Vanalytics.Web/src/pages/CharactersPage.tsx` | Remove create form |
| Modify | `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx` | Remove license badge |
| Modify | `src/Vanalytics.Web/src/components/CharacterCard.tsx` | Remove license badge |
| Modify | `src/Vanalytics.Web/src/pages/ProfilePage.tsx` | Remove Licensing tab |
| Modify | `src/Vanalytics.Web/src/pages/SetupGuidePage.tsx` | Remove step 2, licensing troubleshooting, character-not-found troubleshooting |
| Modify | `src/Vanalytics.Web/src/components/ProtectedRoute.tsx` | Redirect to `/` |
| Modify | `src/Vanalytics.Web/src/components/Layout.tsx` | Simplify sidebar (all links always visible, logo links to /dashboard, remove sign-in button) |
| Modify | `src/Vanalytics.Web/src/App.tsx` | Restructure routes, add landing page, wrap all non-public in ProtectedRoute |
| Modify | `src/Vanalytics.Web/src/pages/PublicProfilePage.tsx` | Add standalone wrapper styling (no longer inside Layout) |
| Create | `src/Vanalytics.Web/src/pages/LandingPage.tsx` | Public landing page with sign-in CTA |

---

### Task 1: Remove LicenseStatus from Backend

**Files:**
- Delete: `src/Vanalytics.Core/Enums/LicenseStatus.cs`
- Modify: `src/Vanalytics.Core/Models/Character.cs:12` — remove LicenseStatus property
- Modify: `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs:16-19` — remove LicenseStatus config
- Modify: `src/Vanalytics.Core/DTOs/Characters/CharacterSummaryResponse.cs:8` — remove LicenseStatus field
- Modify: `src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs:8` — remove LicenseStatus field
- Delete: `src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs`

- [ ] **Step 1: Delete LicenseStatus enum file**

Delete `src/Vanalytics.Core/Enums/LicenseStatus.cs`

- [ ] **Step 2: Remove LicenseStatus from Character model**

In `src/Vanalytics.Core/Models/Character.cs`, remove:
```csharp
using Vanalytics.Core.Enums;
```
and remove:
```csharp
public LicenseStatus LicenseStatus { get; set; } = LicenseStatus.Unlicensed;
```

- [ ] **Step 3: Remove LicenseStatus from CharacterConfiguration**

In `src/Vanalytics.Data/Configurations/CharacterConfiguration.cs`, remove lines 16-19:
```csharp
builder.Property(c => c.LicenseStatus)
    .HasConversion<string>()
    .HasMaxLength(32)
    .HasDefaultValue(Core.Enums.LicenseStatus.Unlicensed);
```
Also remove any `using Vanalytics.Core.Enums;` if present.

- [ ] **Step 4: Remove LicenseStatus from DTOs**

In `CharacterSummaryResponse.cs`, remove:
```csharp
public string LicenseStatus { get; set; } = string.Empty;
```

In `CharacterDetailResponse.cs`, remove:
```csharp
public string LicenseStatus { get; set; } = string.Empty;
```

- [ ] **Step 5: Delete CreateCharacterRequest.cs**

Delete `src/Vanalytics.Core/DTOs/Characters/CreateCharacterRequest.cs`

- [ ] **Step 6: Verify build**

Run: `dotnet build src/Vanalytics.Core && dotnet build src/Vanalytics.Data`
Expected: Build errors in Api project (expected — controllers still reference removed types). Core and Data should build clean.

---

### Task 2: Update SyncController with Find-or-Create Logic

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/SyncController.cs`

- [ ] **Step 1: Rewrite SyncController.Sync method**

Replace the existing `Sync` method with find-or-create logic. Remove the license check. Add concurrency handling for the unique constraint on (Name, Server).

```csharp
[HttpPost]
public async Task<IActionResult> Sync([FromBody] SyncRequest request)
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var apiKey = Request.Headers["X-Api-Key"].ToString();
    if (!_rateLimiter.IsAllowed(apiKey))
        return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

    // Find or create character
    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

    if (character is null)
    {
        character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.CharacterName,
            Server = request.Server,
            IsPublic = false,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Characters.Add(character);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Unique constraint race condition — re-read
            _db.Entry(character).State = Microsoft.EntityFrameworkCore.EntityState.Detached;
            character = await _db.Characters
                .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);
            if (character is null)
                return StatusCode(500, new { message = "Failed to create character" });
        }
    }

    // Verify ownership
    if (character.UserId != userId)
        return StatusCode(403, new { message = "Character is not owned by this account" });

    // Full state replacement
    await _db.CharacterJobs.Where(j => j.CharacterId == character.Id).ExecuteDeleteAsync();
    await _db.EquippedGear.Where(g => g.CharacterId == character.Id).ExecuteDeleteAsync();
    await _db.CraftingSkills.Where(s => s.CharacterId == character.Id).ExecuteDeleteAsync();

    var newJobs = new List<CharacterJob>();
    foreach (var jobEntry in request.Jobs)
    {
        if (!Enum.TryParse<JobType>(jobEntry.Job, true, out var jobType)) continue;
        newJobs.Add(new CharacterJob
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            JobId = jobType,
            Level = jobEntry.Level,
            IsActive = jobEntry.Job.Equals(request.ActiveJob, StringComparison.OrdinalIgnoreCase)
        });
    }
    _db.CharacterJobs.AddRange(newJobs);

    var newGear = new List<EquippedGear>();
    foreach (var gearEntry in request.Gear)
    {
        if (!Enum.TryParse<EquipSlot>(gearEntry.Slot, true, out var slot)) continue;
        newGear.Add(new EquippedGear
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Slot = slot,
            ItemId = gearEntry.ItemId,
            ItemName = gearEntry.ItemName
        });
    }
    _db.EquippedGear.AddRange(newGear);

    var newCrafting = new List<CraftingSkill>();
    foreach (var craftEntry in request.Crafting)
    {
        if (!Enum.TryParse<CraftType>(craftEntry.Craft, true, out var craft)) continue;
        newCrafting.Add(new CraftingSkill
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Craft = craft,
            Level = craftEntry.Level,
            Rank = craftEntry.Rank
        });
    }
    _db.CraftingSkills.AddRange(newCrafting);

    character.LastSyncAt = DateTimeOffset.UtcNow;
    character.UpdatedAt = DateTimeOffset.UtcNow;
    await _db.SaveChangesAsync();

    return Ok(new { message = "Sync successful", lastSyncAt = character.LastSyncAt });
}
```

- [ ] **Step 2: Clean up imports**

Do NOT remove `using Vanalytics.Core.Enums;` — it is still needed for `JobType`, `EquipSlot`, and `CraftType`. Only remove any standalone `using` for `LicenseStatus` if one exists (there isn't one — it's accessed through the namespace).

---

### Task 3: Update CharactersController

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/CharactersController.cs`

- [ ] **Step 1: Remove the Create (POST) action**

Delete the entire `Create` method (lines 43-73).

- [ ] **Step 2: Remove LicenseStatus from all response mappings**

In the `List` method, remove:
```csharp
LicenseStatus = c.LicenseStatus.ToString(),
```

In the `Update` method, remove the same line from the response object.

In the `MapToDetail` static method, remove the same line.

- [ ] **Step 3: Remove unused imports**

Remove `using Vanalytics.Core.DTOs.Characters;` only if `CreateCharacterRequest` was the only thing used from it — but other DTOs are still used, so just verify no compile errors.

- [ ] **Step 4: Verify API project builds**

Run: `dotnet build src/Vanalytics.Api`
Expected: 0 errors

---

### Task 4: Create EF Core Migration

**Files:**
- Create: New migration files in `src/Vanalytics.Data/Migrations/`

- [ ] **Step 1: Create migration**

Run from repo root:
```bash
dotnet ef migrations add RemoveLicenseStatus --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```

- [ ] **Step 2: Review generated migration**

Verify the `Up` method drops the `LicenseStatus` column from `Characters` table. The `Down` method should re-add it.

- [ ] **Step 3: Verify full solution builds**

Run: `dotnet build`
Expected: 0 errors

---

### Task 5: Remove Licensing from Frontend Types and Components

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`
- Modify: `src/Vanalytics.Web/src/components/CharacterCard.tsx`
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

- [ ] **Step 1: Update TypeScript types**

In `src/Vanalytics.Web/src/types/api.ts`:

Remove `licenseStatus` from `CharacterSummary`:
```typescript
// Remove this line:
licenseStatus: string
```

Remove `licenseStatus` from `CharacterDetail`:
```typescript
// Remove this line:
licenseStatus: string
```

Remove the entire `CreateCharacterRequest` interface (lines 71-74):
```typescript
// Delete:
export interface CreateCharacterRequest {
  name: string
  server: string
}
```

Remove the `UpdateCharacterRequest` interface (lines 76-78) — only had `isPublic` for the toggle, but we can inline this:
```typescript
// Delete:
export interface UpdateCharacterRequest {
  isPublic: boolean
}
```

- [ ] **Step 2: Remove license badge from CharacterCard**

In `src/Vanalytics.Web/src/components/CharacterCard.tsx`, remove the license status badge (lines 23-31):
```tsx
// Delete this block:
<span
  className={`rounded px-2 py-0.5 text-xs font-medium ${
    character.licenseStatus === 'Active'
      ? 'bg-green-900/50 text-green-400'
      : 'bg-gray-800 text-gray-500'
  }`}
>
  {character.licenseStatus}
</span>
```

- [ ] **Step 3: Remove license badge from CharacterDetailPage**

In `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`, remove the license badge (lines 33-41):
```tsx
// Delete this block:
<span
  className={`rounded px-2 py-0.5 text-xs font-medium ${
    character.licenseStatus === 'Active'
      ? 'bg-green-900/50 text-green-400'
      : 'bg-gray-800 text-gray-500'
  }`}
>
  {character.licenseStatus}
</span>
```

---

### Task 6: Remove Create Form from CharactersPage and Licensing Tab from ProfilePage

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/CharactersPage.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Simplify CharactersPage**

Remove the create form, server fetch, and related state. Replace with an info message. Keep the character list, toggle public, and delete functionality.

Remove these state variables: `name`, `server`, `servers`
Remove the `handleCreate` function and the server fetch in useEffect.
Remove the `<form>` block (lines 84-121).
Remove `CreateCharacterRequest` and `GameServer` from the import.

Add an info message above the character list:
```tsx
<p className="text-sm text-gray-500 mb-6">
  Characters are automatically added when your Windower addon syncs.
</p>
```

- [ ] **Step 2: Remove Licensing tab from ProfilePage**

In `src/Vanalytics.Web/src/pages/ProfilePage.tsx`:

Change the tabs array to remove 'licensing':
```typescript
type Tab = 'session' | 'apikeys'

const tabs: { id: Tab; label: string }[] = [
  { id: 'session', label: 'Session' },
  { id: 'apikeys', label: 'API Keys' },
]
```

Remove the entire Licensing tab render block:
```tsx
// Delete this block:
{activeTab === 'licensing' && (
  <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
    <h2 className="text-lg font-semibold mb-4">Character Licensing</h2>
    ...
  </section>
)}
```

---

### Task 7: Update Setup Guide

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/SetupGuidePage.tsx`

- [ ] **Step 1: Remove Step 2 (Register Your Character)**

Delete the entire Step 2 block that references `/characters`.

- [ ] **Step 2: Renumber remaining steps**

After removing Step 2, renumber:
- Old Step 3 (Generate API Key) → Step 2
- Old Step 4 (Install Addon) → Step 3
- Old Step 5 (Configure API Key) → Step 4
- Old Step 6 (Load Addon) → Step 5
- Old Step 7 (Verify Sync) → Step 6

- [ ] **Step 3: Remove licensing and character-not-found troubleshooting entries**

Delete the "Character does not have an active license" troubleshooting entry.
Delete the "Character not found" troubleshooting entry (auto-registration makes this impossible).

- [ ] **Step 4: Remove `useAuth` import if no longer used**

The `user?.hasApiKey` check in Step 3 (now Step 2) still uses `useAuth`, so keep it.

---

### Task 8: Create Landing Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/LandingPage.tsx`

- [ ] **Step 1: Create LandingPage component**

```tsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLoginModal } from '../context/LoginModalContext'
import { LoginModalProvider } from '../context/LoginModalContext'
import LoginModal from '../components/LoginModal'
import { Swords, Radio, Package, Store, Clock, BookOpen } from 'lucide-react'

function LandingContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { isOpen: loginOpen, open: openLogin, close: closeLogin } = useLoginModal()

  // If already logged in, redirect to dashboard
  if (user) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const features = [
    { icon: Swords, title: 'Character Tracking', desc: 'Automatically sync your jobs, gear, and crafting skills from the game.' },
    { icon: Package, title: 'Item Database', desc: 'Browse the complete FFXI item database with stats and pricing.' },
    { icon: Store, title: 'Bazaar Activity', desc: 'Track bazaar listings and find deals across servers.' },
    { icon: Radio, title: 'Server Status', desc: 'Real-time monitoring of FFXI server availability.' },
    { icon: Clock, title: "Vana'diel Clock", desc: 'Moon phases, guild hours, RSE schedule, conquest tally, and ferry times.' },
    { icon: BookOpen, title: 'Easy Setup', desc: 'Install the Windower addon, sync, and your data appears automatically.' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <img src="/vanalytics-square-logo.png" alt="" className="h-16 w-16 shrink-0 -mr-2" />
            <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="max-w-[280px]" />
          </div>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Track your Final Fantasy XI characters, browse the item database, monitor server status, and more.
          </p>
          <button
            onClick={openLogin}
            className="rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Get Started
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <f.icon className="h-8 w-8 text-blue-400 mb-3" />
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {loginOpen && <LoginModal onClose={closeLogin} />}
    </div>
  )
}

export default function LandingPage() {
  return (
    <LoginModalProvider>
      <LandingContent />
    </LoginModalProvider>
  )
}
```

---

### Task 9: Update ProtectedRoute

**Files:**
- Modify: `src/Vanalytics.Web/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Redirect to landing page instead of /servers**

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  return <>{children}</>
}
```

---

### Task 10: Restructure Routes and Sidebar

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Update App.tsx routes**

The landing page and public profiles live outside the Layout. Everything else is inside Layout and wrapped in ProtectedRoute.

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import OAuthCallback from './pages/OAuthCallback'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import CharactersPage from './pages/CharactersPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import ProfilePage from './pages/ProfilePage'
import SetupGuidePage from './pages/SetupGuidePage'
import ServerStatusPage from './pages/ServerStatusPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminItemsPage from './pages/AdminItemsPage'
import ItemDatabasePage from './pages/ItemDatabasePage'
import ItemDetailPage from './pages/ItemDetailPage'
import BazaarActivityPage from './pages/BazaarActivityPage'
import VanadielClockPage from './pages/VanadielClockPage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public: landing page (no layout) */}
          <Route path="/" element={<LandingPage />} />

          {/* Public: shareable character profiles (no layout) */}
          <Route path="/:server/:name" element={<PublicProfilePage />} />

          {/* OAuth callback */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* All app pages: sidebar layout + auth required */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/characters" element={<ProtectedRoute><CharactersPage /></ProtectedRoute>} />
            <Route path="/characters/:id" element={<ProtectedRoute><CharacterDetailPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/servers" element={<ProtectedRoute><ServerStatusPage /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><ItemDatabasePage /></ProtectedRoute>} />
            <Route path="/items/:id" element={<ProtectedRoute><ItemDetailPage /></ProtectedRoute>} />
            <Route path="/bazaar" element={<ProtectedRoute><BazaarActivityPage /></ProtectedRoute>} />
            <Route path="/clock" element={<ProtectedRoute><VanadielClockPage /></ProtectedRoute>} />
            <Route path="/setup" element={<ProtectedRoute><SetupGuidePage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
            <Route path="/admin/data" element={<ProtectedRoute><AdminItemsPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Simplify Layout sidebar**

Since all sidebar pages now require login, the sidebar always has a user. Make these changes to `Layout.tsx`:

1. **Remove the `isPublicPage` logic** (lines 45-65) — the landing page and public profiles are no longer rendered inside Layout.

2. **Logo links to `/dashboard`** instead of `/servers` (lines 87 and 164).

3. **Show all nav links unconditionally** — remove the `{user && (...)}` conditional around Dashboard/Characters (lines 99-104). All links are always visible since user is always logged in within the sidebar.

4. **Remove the Sign In button** from the sidebar footer (lines 142-150). Only keep the user profile NavLink (lines 124-141). The `else` branch with the LogIn button is unreachable.

5. **Remove `LogIn` from lucide-react imports** (no longer used).

---

### Task 11: Wrap PublicProfilePage with Standalone Styling

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/PublicProfilePage.tsx`

Since `PublicProfilePage` now renders outside the Layout (which previously provided the background and text styling), wrap its content in a container with the app's base styles.

- [ ] **Step 1: Add wrapper div**

Wrap the component's return JSX in:
```tsx
<div className="min-h-screen bg-gray-950 text-gray-100">
  <main className="mx-auto max-w-4xl px-4 py-8">
    {/* existing content */}
  </main>
</div>
```

Apply this wrapper to all return paths (loading, not found, and the main profile view).

---

### Task 12: Verify and Clean Up

- [ ] **Step 1: Run TypeScript check**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run .NET build**

Run: `dotnet build`
Expected: 0 errors

- [ ] **Step 3: Verify no stale references**

Search for any remaining references to `LicenseStatus`, `CreateCharacterRequest`, or `licensing` in the frontend:
```bash
grep -ri "licensestatus\|createcharacterrequest\|licensing" src/Vanalytics.Web/src/
```
Expected: No matches (or only in irrelevant contexts)

- [ ] **Step 4: Verify no stale references in backend**

```bash
grep -ri "LicenseStatus\|CreateCharacterRequest" src/Vanalytics.Core/ src/Vanalytics.Api/ src/Vanalytics.Data/Configurations/
```
Expected: No matches outside migration files (migration history files will still reference the old column, which is expected)
