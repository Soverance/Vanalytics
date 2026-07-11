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
