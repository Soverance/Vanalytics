# Queued commits — Private-by-default Linkshells (branch july-2)

`git commit` is blocked from Claude's tools, so each reviewed task's commit is queued here for
Scott to run. Changes are already in the working tree. Run these in order from the repo root
(`D:/Git/soverance/Vanalytics`). Each task was reviewed clean before being queued.

When done, also commit the design docs:
`git add docs/superpowers/specs/2026-07-11-linkshell-privacy-design.md docs/superpowers/plans/2026-07-11-linkshell-privacy.md && git commit -m "docs: linkshell privacy spec + plan"`

> ⚠ SHARED FILE — `src/Vanalytics.Data/Migrations/VanalyticsDbContextModelSnapshot.cs` is auto-generated and
> is being edited by BOTH this feature (adds `Linkshell.IsPublic`) and a parallel "Character Role Label"
> feature on july-2 (adds `Character.Role`). The working-tree copy currently contains BOTH changes. When you
> commit Task 1, that snapshot file carries the parallel `Role` mapping too. Reconcile by hand or, simplest,
> regenerate the snapshot (`dotnet ef migrations` state) after BOTH features' migrations exist so it reflects
> both columns. Don't split the two features' snapshot edits blindly.

---

## Task 1 — Linkshell.IsPublic + migration (reviewed clean)

```bash
git add src/Vanalytics.Core/Models/Linkshell.cs src/Vanalytics.Data/Migrations/
git commit -m "feat(linkshell): add IsPublic flag + migration (all existing → private)"
```
(See the SHARED FILE warning above re: the ModelSnapshot also carrying the parallel `Role` mapping.)

## Task 2 — directory excludes private + legacy test seeder made public (reviewed clean)

```bash
git add src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellsControllerTests.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellBrowserTests.cs
git commit -m "feat(linkshell): exclude private linkshells from directory"
```

## Task 3 — profile visibility gate + IsPublic in response (reviewed clean)

```bash
git add src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        src/Vanalytics.Api/DTOs/LinkshellProfileResponse.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellsControllerTests.cs
git commit -m "feat(linkshell): gate private profile to current members"
```
(Note: LinkshellsController.cs + LinkshellsControllerTests.cs also carry Task 2's changes — staging them here is fine if Task 2's commit already ran; if committing out of order, these files accumulate all task edits.)

## Task 4 — manager public/private toggle via PUT /profile (reviewed clean)

```bash
git add src/Vanalytics.Api/DTOs/LinkshellManageDtos.cs \
        src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellsControllerTests.cs
git commit -m "feat(linkshell): manager toggle for public/private listing"
```

## Task 5 — applications to a private linkshell 404 (reviewed clean)

```bash
git add src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellsControllerTests.cs
git commit -m "feat(linkshell): reject applications to private linkshells"
```

## Task 6 — frontend visibility toggle + private badge (reviewed clean)

```bash
git add src/Vanalytics.Web/src/types/api.ts \
        src/Vanalytics.Web/src/pages/LinkshellManagePage.tsx \
        src/Vanalytics.Web/src/pages/LinkshellProfilePage.tsx
git commit -m "feat(linkshell): visibility toggle + private badge in web UI"
```
> ⚠ SHARED FILE — `src/Vanalytics.Web/src/types/api.ts` also carries the parallel "Character Role Label"
> feature's `role: string` additions to `CharacterSummary`/`CharacterDetail` (my change here is only the
> `isPublic: boolean` on `LinkshellProfileResponse`). Same situation as the EF ModelSnapshot: staging this
> file stages both features' edits. Coordinate with the parallel feature's commit so neither is lost.

---

# Queued commits — Currency Tracker feature

## Task 1 — Currency catalog TS lib + tests (reviewed clean, 11/11 green)

New files (frontend-only, no addon/backend changes yet). Caps verified against BG-Wiki
(bg-wiki.com) 2026-09; see inline comments in `currencies.ts` for sourcing notes and the
task report for the full list of `cap: null` entries and low/moderate-confidence caps.

```bash
git add src/Vanalytics.Web/src/lib/currencies.ts src/Vanalytics.Web/src/lib/currencies.test.ts
git commit -m "feat(currencies): currency catalog + merge helper with caps"
```

## Task 2 — Addon capture module `currencies.lua` (self-reviewed; no Lua test harness / live client to verify)

New addon module decodes packets 0x113/0x118 (all 80 Master-Table keys, cross-checked 1:1
against `currencies.ts`'s `CURRENCIES` keys) into a flat `{ key = value }` table, with
per-character disk cache + sync mirroring `progression.lua`. Wired into `vanalytics.lua`:
require, `currencies.init` alongside `progression.init`, dispatch for `0x113`/`0x118` in the
incoming-chunk handler, `currencies.sync` added to the sync-chain step list, `currencies.reset()`
on logout. The pre-existing uncommitted 403-status WIP block in `do_sync` was left untouched.

```bash
git add addon/vanalytics/currencies.lua addon/vanalytics/vanalytics.lua
git commit -m "feat(addon): capture currencies from packets 0x113/0x118"
```
> ⚠ Not runtime-verified — no Lua test harness and no live FFXI client available in this
> environment. Verified by code review only (see task-2-report.md for the checklist). Recommend
> a live spot-check per the brief's Step 5 (open Currencies I/II menus, sync, compare ~6 values
> including a negative-capable Conquest Points read) before/soon after this ships.

## Task 3 — CharacterCurrencies entity + EF config + migration (build green, snapshot clean)

New `CharacterCurrencies` entity (1:1 with `Character`, `CharacterId` PK, `CurrenciesJson
nvarchar(max)`, `UpdatedAt`, cascade-delete FK) cloning the `CharacterProgression` pattern.
DbSet registered in `VanalyticsDbContext`. Migration `20260902141708_AddCharacterCurrencies`
generated and verified against the expected `CreateTable` shape. `dotnet build src/Vanalytics.Api`
succeeds (0 errors). No competing uncommitted `VanalyticsDbContextModelSnapshot.cs` edits existed
on branch sept-1 — this migration's snapshot diff is clean (only the CharacterCurrencies additions).

```bash
git add src/Vanalytics.Core/Models/CharacterCurrencies.cs src/Vanalytics.Data/Configurations/CharacterCurrenciesConfiguration.cs src/Vanalytics.Data/VanalyticsDbContext.cs src/Vanalytics.Data/Migrations/
git commit -m "feat(currencies): CharacterCurrencies entity + migration"
```

## Task 4 — Sync endpoint + DTO + tests (4/4 green)

New `CurrenciesSyncRequest` DTO (`CharacterName`, `Server`, `Dictionary<string, long>? Currencies`)
and `CurrenciesController` (`POST /api/sync/currencies`, `ApiKey` auth scheme, rate-limited,
resolves character by name+server → 404/403, upserts the 1:1 `CharacterCurrencies` row, serializes
`Currencies` to `CurrenciesJson` with camelCase when non-empty, stamps `UpdatedAt`) — clones the
`ProgressionController` sync pattern exactly. Added 4 test cases to `SyncControllerTests.cs`
(`SyncCurrencies_WithValidApiKey_UpsertsBlob`, `SyncCurrencies_SecondPost_OverwritesBlob`,
`SyncCurrencies_CharacterNotOwned_ReturnsForbidden`, `SyncCurrencies_WithoutApiKey_ReturnsUnauthorized`)
using the existing `SetupSyncUserAsync`/`CreateSyncRequest` helpers plus a new
`CreateCurrencySyncRequest` helper. Verified via Testcontainers (Docker, MSSQL 2022):
`dotnet test tests/Vanalytics.Api.Tests --filter "FullyQualifiedName~SyncControllerTests&FullyQualifiedName~Currenc"`
→ `Passed! - Failed: 0, Passed: 4, Skipped: 0, Total: 4, Duration: 51 s`.

```bash
git add src/Vanalytics.Core/DTOs/Sync/CurrenciesSyncRequest.cs src/Vanalytics.Api/Controllers/CurrenciesController.cs tests/Vanalytics.Api.Tests/Controllers/SyncControllerTests.cs
git commit -m "feat(currencies): sync endpoint + tests"
```

## Task 5 — Read endpoints + response DTO + TS type (build green, both dotnet + web)

New `CurrencyResponse` DTO (`Dictionary<string, long> Currencies`, `DateTimeOffset? UpdatedAt`).
`CharactersController` gets `GET /api/characters/{id}/currencies` (owner-check → 404/403) plus
the shared `internal static LoadCurrenciesAsync(db, id)` loader (deserializes `CurrenciesJson`
with the controller's camelCase `JsonOpts`, empty dict if no row/null blob) — inserted
immediately after `LoadProgressionAsync` (existing lines ~251-298; new code now lines 300-324).
`ProfilesController` gets the mirrored public `GET /api/profiles/{server}/{name}/currencies`
(inserted after `GetPublicProgression`, now lines 120-126), resolving id via the existing
`ResolvePublicCharacterIdAsync` → 404, then calling `CharactersController.LoadCurrenciesAsync`.
Web: `CurrencyResponse { currencies: Record<string, number>; updatedAt: string | null }` added
to `src/Vanalytics.Web/src/types/api.ts` right after `ProgressionResponse` (now lines 920-926).
Verified: `dotnet build src/Vanalytics.Api` → Build succeeded, 0 errors (pre-existing NuGet
vulnerability warnings only). `npm run build` (local node v26.7.0, real typecheck per repo
convention since `tsc --noEmit` is a no-op here) → succeeded, 0 type errors.

```bash
git add src/Vanalytics.Core/DTOs/Characters/CurrencyResponse.cs src/Vanalytics.Api/Controllers/CharactersController.cs src/Vanalytics.Api/Controllers/ProfilesController.cs src/Vanalytics.Web/src/types/api.ts
git commit -m "feat(currencies): read endpoints + response type"
```

## Task 6 — Web UI "Currency" sub-tab under Progression (build green, no test harness for this component)

New `CurrencyTable.tsx` (search box, category-filter select, sort select
name/value/category/%-of-cap, hide-zero toggle [default on], near-cap-only
toggle) rendering a table with Currency/Category/Value/Cap/%-of-cap columns;
rows sourced via `listCurrencies` (Task 1), amber highlight + amber text when
`pctOfCap >= 90`. `ProgressionTab.tsx`: added `'Currency'` to the
`PROGRESSION_TABS` tuple, imported `CurrencyTable` + `CurrencyResponse`, added
lazy-loaded currency state (`currencyData`/`currencyLoaded`) with two effects —
one resets both on `base` change, the other fetches `${base}/currencies` only
once when the Currency sub-tab is first opened — and split the render tail
into three explicit branches (`Master Levels` / `Travel` / `Currency`, was
previously `Master Levels` / else-`Travel`). The public profile page inherits
the new sub-tab automatically via the existing `fetchBase` prop — no change
needed there. Verified: `npm run build` (node:22-alpine per repo convention)
→ `tsc -b && vite build` succeeded, 0 type errors.
⚠ Runtime/visual behavior (search/sort/filter/near-cap highlight, public
profile render) NOT verified in this environment — no running stack or
synced character data available. Scott: manual check per brief Step 4.

```bash
git add src/Vanalytics.Web/src/components/character/CurrencyTable.tsx src/Vanalytics.Web/src/components/character/ProgressionTab.tsx
git commit -m "feat(currencies): Currency sub-tab under Progression"
```
