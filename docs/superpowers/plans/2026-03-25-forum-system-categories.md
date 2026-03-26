# Forum System Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-seed four undeletable "System" forum categories on startup, visually distinguished in the UI, protected from edit/delete.

**Architecture:** Add `IsSystem` bool to `ForumCategory`, create a startup seeder in the Common library, guard controller endpoints, and style system categories distinctly in the frontend.

**Tech Stack:** C# / EF Core / ASP.NET Core (backend), React / TypeScript / Tailwind (frontend)

**Spec:** `docs/superpowers/specs/2026-03-25-forum-system-categories-design.md`

---

### Task 1: Add IsSystem to ForumCategory Model

**Files:**
- Modify: `src/lib/Common/src/Soverance.Forum/Models/ForumCategory.cs`

- [ ] **Step 1: Add the property**

```csharp
// In ForumCategory.cs, add after DisplayOrder:
public bool IsSystem { get; set; }
```

The full file becomes:

```csharp
namespace Soverance.Forum.Models;

public class ForumCategory
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public bool IsSystem { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<ForumThread> Threads { get; set; } = [];
}
```

---

### Task 2: Configure IsSystem in EF

**Files:**
- Modify: `src/lib/Common/src/Soverance.Forum/Configurations/ForumCategoryConfiguration.cs`

- [ ] **Step 1: Add column configuration**

Add after the `DisplayOrder` line in `Configure()`:

```csharp
builder.Property(c => c.IsSystem).HasDefaultValue(false);
```

---

### Task 3: Add IsSystem to CategoryResponse DTO

**Files:**
- Modify: `src/lib/Common/src/Soverance.Forum/DTOs/ForumDtos.cs`

- [ ] **Step 1: Update the record**

Change the `CategoryResponse` record to include `IsSystem`:

```csharp
public record CategoryResponse(
    int Id, string Name, string Slug, string Description,
    int DisplayOrder, bool IsSystem, int ThreadCount, DateTimeOffset? LastActivityAt);
```

---

### Task 4: Update CategoryResponse Construction Sites in ForumService

**Files:**
- Modify: `src/lib/Common/src/Soverance.Forum/Services/ForumService.cs`

Every place that constructs a `CategoryResponse` must include the new `IsSystem` parameter. There are four sites.

- [ ] **Step 1: Update GetCategoriesAsync (line 23-27)**

Also update sort order to put system categories first:

```csharp
public async Task<List<CategoryResponse>> GetCategoriesAsync()
{
    return await _db.Set<ForumCategory>()
        .OrderByDescending(c => c.IsSystem)
        .ThenBy(c => c.DisplayOrder)
        .ThenBy(c => c.Name)
        .Select(c => new CategoryResponse(
            c.Id, c.Name, c.Slug, c.Description, c.DisplayOrder,
            c.IsSystem,
            c.Threads.Count,
            c.Threads.SelectMany(t => t.Posts).Max(p => (DateTimeOffset?)p.CreatedAt)))
        .ToListAsync();
}
```

- [ ] **Step 2: Update GetCategoryBySlugAsync (line 34-38)**

```csharp
return await _db.Set<ForumCategory>()
    .Where(c => c.Slug == slug)
    .Select(c => new CategoryResponse(
        c.Id, c.Name, c.Slug, c.Description, c.DisplayOrder,
        c.IsSystem,
        c.Threads.Count,
        c.Threads.SelectMany(t => t.Posts).Max(p => (DateTimeOffset?)p.CreatedAt)))
    .FirstOrDefaultAsync();
```

- [ ] **Step 3: Update CreateCategoryAsync (line 57-59)**

```csharp
return new CategoryResponse(
    category.Id, category.Name, category.Slug, category.Description,
    category.DisplayOrder, false, 0, null);
```

- [ ] **Step 4: Update UpdateCategoryAsync (line 78-80)**

```csharp
return new CategoryResponse(
    category.Id, category.Name, category.Slug, category.Description,
    category.DisplayOrder, category.IsSystem, threadCount, lastActivity);
```

---

### Task 5: Create ForumSeeder

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/Services/ForumSeeder.cs`

- [ ] **Step 1: Create the seeder**

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.Models;

namespace Soverance.Forum.Services;

public static class ForumSeeder
{
    private static readonly (string Slug, string Name, string Description, int DisplayOrder)[] SystemCategories =
    [
        ("news", "News", "News updates about Vanalytics", 0),
        ("help", "Help", "Help with features in Vanalytics", 1),
        ("bugs", "Bugs", "Report bugs in Vanalytics", 2),
        ("suggestions", "Suggestions", "Request new features for Vanalytics", 3),
    ];

    public static async Task SeedSystemCategoriesAsync(DbContext db)
    {
        var existing = await db.Set<ForumCategory>()
            .Where(c => c.IsSystem)
            .ToListAsync();

        var now = DateTimeOffset.UtcNow;

        foreach (var (slug, name, description, displayOrder) in SystemCategories)
        {
            var category = existing.FirstOrDefault(c => c.Slug == slug);

            if (category == null)
            {
                db.Set<ForumCategory>().Add(new ForumCategory
                {
                    Name = name,
                    Slug = slug,
                    Description = description,
                    DisplayOrder = displayOrder,
                    IsSystem = true,
                    CreatedAt = now,
                });
            }
            else
            {
                if (category.Name != name) category.Name = name;
                if (category.Description != description) category.Description = description;
                if (category.DisplayOrder != displayOrder) category.DisplayOrder = displayOrder;
            }
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Another instance may have seeded concurrently — safe to ignore
        }
    }
}
```

---

### Task 6: Add EF Migration

**Files:**
- Create: new migration in `src/Vanalytics.Data/Migrations/`

- [ ] **Step 1: Generate the migration**

Run from `src/Vanalytics.Api/`:

```bash
dotnet ef migrations add AddForumCategoryIsSystem --project ../Vanalytics.Data
```

- [ ] **Step 2: Apply the migration**

```bash
dotnet ef database update --project ../Vanalytics.Data
```

---

### Task 7: Call Seeder from Program.cs

**Files:**
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Add seeder call after MigrateAsync**

In the startup scope block, after the admin seeder `if` block (after line 136), still within the `using` scope, add:

```csharp
await ForumSeeder.SeedSystemCategoriesAsync(db);
```

Add the using at the top of Program.cs:

```csharp
using Soverance.Forum.Services;
```

---

### Task 8: Guard Controller Endpoints

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ForumController.cs`

- [ ] **Step 1: Guard UpdateCategory (line 298-306)**

Replace the method body:

```csharp
[Authorize(Roles = "Moderator,Admin")]
[HttpPut("categories/{id}")]
public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100)
        return BadRequest(new { error = "Name is required and must be 100 characters or less." });
    if (request.Description?.Length > 500)
        return BadRequest(new { error = "Description must be 500 characters or less." });

    var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
    var category = await db.Set<ForumCategory>().FindAsync(id);
    if (category == null) return NotFound();
    if (category.IsSystem) return BadRequest(new { error = "System categories cannot be modified." });

    var result = await _forum.UpdateCategoryAsync(id, request);
    return result != null ? Ok(result) : NotFound();
}
```

- [ ] **Step 2: Guard DeleteCategory (line 309-317)**

Replace the method body:

```csharp
[Authorize(Roles = "Moderator,Admin")]
[HttpDelete("categories/{id}")]
public async Task<IActionResult> DeleteCategory(int id)
{
    var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
    var category = await db.Set<ForumCategory>().FindAsync(id);
    if (category == null) return NotFound();
    if (category.IsSystem) return BadRequest(new { error = "System categories cannot be deleted." });

    var result = await _forum.DeleteCategoryAsync(id);
    if (!result) return Conflict(new { error = "Category not found or has threads." });

    return NoContent();
}
```

Add the `ForumCategory` using if not already present:

```csharp
using Soverance.Forum.Models;
```

---

### Task 9: Update Frontend TypeScript Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Add isSystem to CategoryResponse**

Update the interface at line 168:

```typescript
export interface CategoryResponse {
  id: number
  name: string
  slug: string
  description: string
  displayOrder: number
  isSystem: boolean
  threadCount: number
  lastActivityAt: string | null
}
```

---

### Task 10: Update ForumCategoryCard with System Styling

**Files:**
- Modify: `src/Vanalytics.Web/src/components/forum/ForumCategoryCard.tsx`

- [ ] **Step 1: Add system category visual treatment and hide mod buttons**

Replace the component:

```tsx
export default function ForumCategoryCard({ category, isModerator, onEdit, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/forum/${category.slug}`)}
      className={`rounded-lg border bg-gray-900 p-4 cursor-pointer hover:bg-gray-800/50 transition-colors group ${
        category.isSystem
          ? 'border-l-4 border-l-amber-500 border-t-gray-800 border-r-gray-800 border-b-gray-800'
          : 'border-gray-800'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-100 group-hover:text-blue-400">{category.name}</h3>
          {category.isSystem && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded">System</span>
          )}
        </div>
        {isModerator && !category.isSystem && (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit?.(category)} className="p-1 text-gray-600 hover:text-gray-300" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete?.(category.id)} className="p-1 text-gray-600 hover:text-red-400" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {category.description && <p className="text-sm text-gray-500 mt-1">{category.description}</p>}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
        <span>{category.threadCount} threads</span>
        {category.lastActivityAt && <span>Last activity {timeAgo(category.lastActivityAt)}</span>}
      </div>
    </div>
  )
}
```

---

### Task 11: Guard ForumCategoryManager Against System Categories

**Files:**
- Modify: `src/Vanalytics.Web/src/components/forum/ForumCategoryManager.tsx`

- [ ] **Step 1: Add early return for system categories**

Add after `const isEditing = editingCategory != null` (line 20):

```tsx
// System categories cannot be edited
if (isEditing && editingCategory.isSystem) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
      System categories cannot be modified.
      <button onClick={onCancelEdit} className="ml-2 text-blue-400 hover:text-blue-300">Dismiss</button>
    </div>
  )
}
```
