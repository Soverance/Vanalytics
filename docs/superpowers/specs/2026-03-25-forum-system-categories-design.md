# Forum System Categories

## Summary

Pre-seed the forum with four undeletable "System" categories that are created on application startup, visually distinguished from user-created categories, and protected from modification by the API.

## System Categories

| Name        | Slug          | Description                           | DisplayOrder |
|-------------|---------------|---------------------------------------|--------------|
| News        | `news`        | News updates about Vanalytics         | 0            |
| Help        | `help`        | Help with features in Vanalytics      | 1            |
| Bugs        | `bugs`        | Report bugs in Vanalytics             | 2            |
| Suggestions | `suggestions` | Request new features for Vanalytics   | 3            |

## Data Model

Add `bool IsSystem` (default `false`) to `ForumCategory`. No per-category color column; the frontend applies a uniform visual treatment based on the `IsSystem` flag.

**EF migration:** Add `IsSystem` column with `bit` type, default `false`.

## Startup Seeder

`ForumSeeder.SeedSystemCategoriesAsync(DbContext)` in the Common forum library (`Soverance.Forum/Services/ForumSeeder.cs`). Called from `Program.cs` at application startup.

**Logic:**
1. Query existing categories where `IsSystem == true`.
2. For each of the four defined system categories (matched by slug):
   - Missing: insert with `IsSystem = true`, name, description, displayOrder.
   - Present but name/description/displayOrder differs from code: update to match (code is source of truth).
3. `SaveChangesAsync`.
4. Wrap in try/catch for `DbUpdateException` to handle concurrent startup race conditions (unique slug constraint).

Matching by slug means renames of display name or description are safe — threads link via `CategoryId` (int FK), not by name.

Both Vanalytics and soverance.com can call the seeder since it lives in the shared Common library.

## API Protection

Guards live in the **controller layer only** — `ForumService` remains generic. The controller fetches the category, checks `IsSystem`, and returns early with a `400` before calling the service. This avoids changing service return types and keeps the guard logic close to HTTP semantics.

**DELETE `/api/forum/categories/{id}`:** If `IsSystem`, return `400 Bad Request` — "System categories cannot be deleted."

**PUT `/api/forum/categories/{id}`:** If `IsSystem`, return `400 Bad Request` — "System categories cannot be modified."

**POST `/api/forum/categories`:** No change. New categories default to `IsSystem = false`.

**CategoryResponse DTO:** Add `bool IsSystem` so the frontend can distinguish system categories.

**Note:** soverance.com shares the same Common library. If it has its own ForumController, it needs the same guards.

## Category Sort Order

Add `IsSystem DESC` as a secondary sort in `GetCategoriesAsync` so system categories always appear before user-created categories, even if a user-created category has the same DisplayOrder value. Sort becomes: `IsSystem DESC`, then `DisplayOrder ASC`, then `Name ASC`.

## Frontend Changes

**ForumCategoryCard.tsx:**
- System categories get a colored left border (e.g., `border-l-4 border-amber-500`) and a small "System" badge.
- Edit and delete buttons hidden for system categories, even for moderators.

**ForumCategoryManager.tsx:**
- If opened with a system category (defensive), refuse to render the form or show read-only state. Prevents accidental PUT requests if edit button visibility logic is bypassed.

**ForumCategoryListPage.tsx:**
- No logic changes needed. System categories sort first via the updated sort order.

**TypeScript types (`api.ts`):**
- Add `isSystem: boolean` to `CategoryResponse`.

## Files Changed

| File | Change |
|------|--------|
| `Common/.../Models/ForumCategory.cs` | Add `IsSystem` property |
| `Common/.../Configurations/ForumCategoryConfiguration.cs` | Configure `IsSystem` column |
| `Common/.../DTOs/ForumDtos.cs` | Add `IsSystem` to `CategoryResponse` |
| `Common/.../Services/ForumSeeder.cs` | New file — startup seeder |
| `Common/.../Services/ForumService.cs` | Add `IsSystem` to all `CategoryResponse` construction sites; add `IsSystem DESC` to sort |
| `Vanalytics.Api/Controllers/ForumController.cs` | Guard delete/update endpoints against `IsSystem` |
| `Vanalytics.Data/Migrations/...` | New migration adding `IsSystem` column |
| `Vanalytics.Api/Program.cs` | Call `ForumSeeder.SeedSystemCategoriesAsync` |
| `Vanalytics.Web/src/types/api.ts` | Add `isSystem` to `CategoryResponse` |
| `Vanalytics.Web/src/components/forum/ForumCategoryCard.tsx` | System badge + border, hide edit/delete |
| `Vanalytics.Web/src/components/forum/ForumCategoryManager.tsx` | Defensive check — refuse form for system categories |
