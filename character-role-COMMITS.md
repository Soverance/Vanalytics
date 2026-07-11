# Queued commits — Character Role Label (branch july-2)

`git commit` is blocked from Claude's tools, so each reviewed task's commit is queued here for
Scott to run. Changes are already in the working tree. Run these in order from the repo root
(`D:/Git/soverance/Vanalytics`). Each task was reviewed clean before being queued.

> ⚠ Shared file note: `src/Vanalytics.Data/Migrations/VanalyticsDbContextModelSnapshot.cs` is
> also touched by the in-flight linkshell-privacy work (`COMMITS.md`). Whichever feature you
> commit second will carry the combined snapshot delta — that is fine (EF snapshots are additive
> and both migrations coexist). Commit linkshell-privacy first, then these, to keep history tidy.

When done, also commit the design docs:
`git add docs/superpowers/specs/2026-07-11-character-role-label-design.md docs/superpowers/plans/2026-07-11-character-role-label.md && git commit -m "docs: character role label spec + plan"`

---

## Task 1 — backend enum, column, migration, DTOs, endpoints (reviewed clean)

```bash
git add src/Vanalytics.Core/Enums/CharacterRole.cs \
        src/Vanalytics.Core/Models/Character.cs \
        src/Vanalytics.Core/DTOs/Characters/UpdateCharacterRequest.cs \
        src/Vanalytics.Core/DTOs/Characters/CharacterSummaryResponse.cs \
        src/Vanalytics.Core/DTOs/Characters/CharacterDetailResponse.cs \
        src/Vanalytics.Api/Controllers/CharactersController.cs \
        src/Vanalytics.Data/Migrations/20260711151927_AddCharacterRole.cs \
        src/Vanalytics.Data/Migrations/20260711151927_AddCharacterRole.Designer.cs \
        src/Vanalytics.Data/Migrations/VanalyticsDbContextModelSnapshot.cs \
        tests/Vanalytics.Api.Tests/Controllers/CharactersControllerTests.cs
git commit -m "feat: add owner-only character Role label (backend + migration)"
```

## Task 2 — characterRoles.ts helper + unit tests (reviewed clean)

```bash
git add src/Vanalytics.Web/src/lib/characterRoles.ts \
        src/Vanalytics.Web/src/lib/characterRoles.test.ts
git commit -m "feat: add characterRoles helper (list, labels, groupByRole)"
```

## Task 3 — types + header dropdown + card badge + grouped list (reviewed clean)

```bash
git add src/Vanalytics.Web/src/types/api.ts \
        src/Vanalytics.Web/src/components/character/CharacterProfileHeader.tsx \
        src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx \
        src/Vanalytics.Web/src/components/CharacterCard.tsx \
        src/Vanalytics.Web/src/pages/CharactersPage.tsx
git commit -m "feat: character role dropdown, badges, and grouped characters list"
```
