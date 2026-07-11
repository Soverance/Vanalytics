# Queued commits — Achievement Points & Leaderboards (branch july-2)

`git commit` is blocked from Claude's tools, so each reviewed task's commit is queued here for
Scott to run. Changes are already in the working tree. Run these in order from the repo root
(`D:/Git/soverance/Vanalytics`). Each task is reviewed clean before being queued.

> Note: the design spec + plan live under `docs/superpowers/` which is gitignored (line 71) —
> they are intentionally local scratch and are NOT committed.

---

> ⚠ SHARED-FILE NOTE: some files are touched by multiple tasks (CharactersController.cs, Program.cs,
> and later App.tsx / api.ts / Layout.tsx / the EF ModelSnapshot). Because nothing is committed mid-run,
> whichever queued commit you run FIRST captures ALL accumulated changes to a shared file; a later task
> block that re-lists the same file will find nothing new to add for it. That is fine — all code lands;
> history is just slightly coarser on shared files. Run the blocks in order and it all commits correctly.

## Task 1 — rubric catalog (reviewed clean)

```bash
git add src/Vanalytics.Core/Data/AchievementRubric.cs \
        tests/Vanalytics.Api.Tests/Achievements/AchievementRubricTests.cs
git commit -m "feat(achievements): rubric catalog"
```

## Task 2 — pure scoring service (reviewed clean)

```bash
git add src/Vanalytics.Core/Services/Achievements/AchievementScoreInput.cs \
        src/Vanalytics.Core/Services/Achievements/AchievementScore.cs \
        src/Vanalytics.Core/Services/Achievements/AchievementScoringService.cs \
        tests/Vanalytics.Api.Tests/Achievements/AchievementScoringServiceTests.cs
git commit -m "feat(achievements): pure scoring service"
```

## Task 3 — mission completion detection (reviewed clean)

```bash
git add src/Vanalytics.Core/Data/MissionTerminals.cs \
        src/Vanalytics.Core/Services/Achievements/MissionProgress.cs \
        tests/Vanalytics.Api.Tests/Achievements/MissionProgressTests.cs
git commit -m "feat(achievements): mission completion detection"
```

## Task 4 — score + linkshell aggregate tables (reviewed clean)

```bash
git add src/Vanalytics.Core/Models/CharacterAchievement.cs \
        src/Vanalytics.Core/Models/LinkshellAchievement.cs \
        src/Vanalytics.Data/Configurations/CharacterAchievementConfiguration.cs \
        src/Vanalytics.Data/Configurations/LinkshellAchievementConfiguration.cs \
        src/Vanalytics.Data/VanalyticsDbContext.cs \
        src/Vanalytics.Data/Migrations/20260711161253_AddAchievements.cs \
        src/Vanalytics.Data/Migrations/20260711161253_AddAchievements.Designer.cs \
        src/Vanalytics.Data/Migrations/VanalyticsDbContextModelSnapshot.cs \
        tests/Vanalytics.Api.Tests/Achievements/AchievementSchemaTests.cs \
        tests/Vanalytics.Api.Tests/Achievements/TestData.cs
git commit -m "feat(achievements): score + linkshell aggregate tables"
```

## Task 5 — recompute service + sync hook (reviewed clean)

```bash
git add src/Vanalytics.Api/Services/AchievementRecomputeService.cs \
        src/Vanalytics.Api/Controllers/CharactersController.cs \
        src/Vanalytics.Api/Controllers/SyncController.cs \
        src/Vanalytics.Api/Program.cs \
        tests/Vanalytics.Api.Tests/Achievements/AchievementDecoderTests.cs \
        tests/Vanalytics.Api.Tests/Achievements/AchievementRecomputeTests.cs
git commit -m "feat(achievements): recompute service + sync hook"
```

## Task 6 — character achievement endpoint (reviewed clean)

```bash
git add src/Vanalytics.Core/DTOs/Achievements/CharacterAchievementResponse.cs \
        src/Vanalytics.Api/Controllers/CharactersController.cs \
        tests/Vanalytics.Api.Tests/Controllers/CharacterAchievementTests.cs
git commit -m "feat(achievements): character achievement endpoint"
```

## Task 7 — character leaderboard endpoint (reviewed clean)

```bash
git add src/Vanalytics.Core/DTOs/Achievements/LeaderboardDtos.cs \
        src/Vanalytics.Api/Controllers/LeaderboardsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/CharacterLeaderboardTests.cs
git commit -m "feat(achievements): character leaderboard endpoint"
```

## Task 8 — linkshell leaderboard endpoint (reviewed clean)

```bash
git add src/Vanalytics.Api/Controllers/LeaderboardsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellLeaderboardTests.cs
git commit -m "feat(achievements): linkshell leaderboard endpoint"
```

## Task 9 — linkshell detail achievement endpoint (reviewed clean)

```bash
git add src/Vanalytics.Core/DTOs/Achievements/LinkshellAchievementResponse.cs \
        src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellAchievementTests.cs
git commit -m "feat(achievements): linkshell detail achievement endpoint"
```

## Task 10 — rubric endpoint + admin rescore (reviewed clean)

```bash
git add src/Vanalytics.Api/Controllers/AchievementsController.cs \
        tests/Vanalytics.Api.Tests/Controllers/AchievementsControllerTests.cs
git commit -m "feat(achievements): rubric endpoint + admin rescore"
```

## Task 12 — leaderboards page + nav (reviewed clean after fix)

```bash
git add src/Vanalytics.Web/src/types/api.ts \
        src/Vanalytics.Web/src/api/client.ts \
        src/Vanalytics.Web/src/pages/LeaderboardsPage.tsx \
        src/Vanalytics.Web/src/lib/leaderboards.ts \
        src/Vanalytics.Web/src/lib/leaderboards.test.ts \
        src/Vanalytics.Web/src/App.tsx \
        src/Vanalytics.Web/src/components/Layout.tsx
git commit -m "feat(achievements): leaderboards page + nav"
```

## Task 13 — character breakdown + rubric page (reviewed clean after fix)

```bash
git add src/Vanalytics.Web/src/components/achievements/AchievementBreakdown.tsx \
        src/Vanalytics.Web/src/components/achievements/achievementUtils.ts \
        src/Vanalytics.Web/src/components/achievements/AchievementBreakdown.test.ts \
        src/Vanalytics.Web/src/pages/RubricPage.tsx \
        src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx \
        src/Vanalytics.Web/src/App.tsx
git commit -m "feat(achievements): character breakdown + rubric page"
```

## Task 14 — directory score columns + LS detail panel (reviewed clean after fixes)

```bash
git add src/Vanalytics.Api/Controllers/PlayersController.cs \
        src/Vanalytics.Api/DTOs/PlayerListItem.cs \
        src/Vanalytics.Api/Controllers/LinkshellsController.cs \
        src/Vanalytics.Api/DTOs/LinkshellListItem.cs \
        src/Vanalytics.Web/src/types/api.ts \
        src/Vanalytics.Web/src/pages/PlayerDirectoryPage.tsx \
        src/Vanalytics.Web/src/pages/LinkshellDirectoryPage.tsx \
        src/Vanalytics.Web/src/pages/LinkshellProfilePage.tsx \
        tests/Vanalytics.Api.Tests/Controllers/PlayersControllerTests.cs \
        tests/Vanalytics.Api.Tests/Controllers/LinkshellBrowserTests.cs
git commit -m "feat(achievements): directory score columns + linkshell detail panel"
```

---

## POST-DEPLOY (one-time backfill)
After deploying (migration auto-applies via DatabaseMigrationService), populate scores for all existing characters ONCE as an admin:
`POST /api/admin/achievements/rescore`  (Admin-role; returns { recomputed: N }).
Ongoing scores maintain themselves via the sync hook. Bump AchievementRubric.Version + re-run this endpoint whenever rubric values change.

## LOCAL SMOKE (before merge)
`docker compose up --build`, hard-refresh (Ctrl+Shift+R), then verify: synced character shows Achievements tab with score + breakdown bars; /leaderboards lists chars + linkshells with server filter + sort; /leaderboards/rubric renders; /players + /linkshells show score columns; a linkshell profile shows the achievement panel.

---
## NOTE — final whole-branch review privacy fix (folded into existing file commits)
The final review found private linkshells could leak onto the public LS leaderboard + detail endpoint.
Fixes are already in the working tree on files ALREADY listed above:
- LeaderboardsController.cs (Task 7/8 blocks) — added `&& a.Linkshell.IsPublic` to LS leaderboard
- LinkshellsController.cs (Task 9/14 blocks) — added IsPublic+current-member gate to GetAchievement
- LinkshellLeaderboardTests.cs / LinkshellAchievementTests.cs — IsPublic seeds + 2 new exclusion tests
Running the queued commits in order captures these automatically (shared-file note above).

---
## REDESIGN — FFXIAH-style header rank (supersedes the Achievements-tab UI)
The Achievements tab was replaced with a header rank badge (+ leaderboard deep-link) + endpoint made anonymously readable for public characters. These files are already listed in earlier task blocks (git add captures current content); the ONLY files not covered elsewhere are the new ones below. `AchievementBreakdown.tsx` + its old test were deleted (never committed — just absent from the tree, no git action needed).

```bash
git add src/Vanalytics.Web/src/components/character/AchievementRankBadge.tsx \
        src/Vanalytics.Web/src/components/character/CharacterProfileHeader.tsx \
        src/Vanalytics.Web/src/pages/PublicProfilePage.tsx \
        src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx \
        src/Vanalytics.Web/src/pages/LeaderboardsPage.tsx \
        src/Vanalytics.Web/src/components/achievements/achievementUtils.ts \
        src/Vanalytics.Web/src/components/achievements/achievementUtils.test.ts \
        src/Vanalytics.Api/Controllers/CharactersController.cs \
        tests/Vanalytics.Api.Tests/Controllers/CharacterAchievementTests.cs
git commit -m "feat(achievements): FFXIAH-style header rank + leaderboard deep-link (replaces tab)"
```
> If you already committed Task 12/13 blocks earlier, just `git add -A` the above paths and commit — git captures the redesigned content either way.

---
## RUBRIC v2 — per-level Jobs + partial-credit Skills (user request)
Jobs now 1 pt/level (was 50@99); Skills now 5×(level/cap) partial credit (was 5@cap); AchievementRubric.Version=2.
Files already listed in earlier task blocks (AchievementRubric.cs, AchievementScoreInput.cs, AchievementScoringService.cs,
AchievementRecomputeService.cs, AchievementScoringServiceTests.cs, AchievementRecomputeTests.cs) — git add captures v2 content.
⚠ Because Version bumped to 2, run the post-deploy backfill (POST /api/admin/achievements/rescore) to rescore everyone under v2.
