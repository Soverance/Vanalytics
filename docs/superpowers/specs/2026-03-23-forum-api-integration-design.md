# Forum API & Database Integration (Phase 2)

**Date:** 2026-03-23
**Phase:** 2 of 4 (Phase 1: Soverance.Forum library — complete)

## Overview

Wire the Soverance.Forum library into Vanalytics — add API endpoints, database migration, author resolution, and DI registration. No frontend (Phase 3).

## Project References

Two csproj files need a reference to the Forum library:

**`src/Vanalytics.Api/Vanalytics.Api.csproj`** (for controller + DI registration):
```xml
<ProjectReference Include="..\lib\Common\src\Soverance.Forum\Soverance.Forum.csproj" />
```

**`src/Vanalytics.Data/Vanalytics.Data.csproj`** (for DbContext `ApplyForumConfigurations()`):
```xml
<ProjectReference Include="..\lib\Common\src\Soverance.Forum\Soverance.Forum.csproj" />
```

## DbContext Integration

In `src/Vanalytics.Data/VanalyticsDbContext.cs`, add to `OnModelCreating`:

```csharp
using Soverance.Forum.Extensions;
// ...
modelBuilder.ApplyForumConfigurations();
```

This registers the 4 forum entity configurations into the Vanalytics database.

## EF Core Migration

After the DbContext change, generate a migration:

```bash
dotnet ef migrations add AddForumTables --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```

Creates `ForumCategories`, `ForumThreads`, `ForumPosts`, and `ForumVotes` tables. The migration auto-applies on startup (existing pattern in Program.cs).

## DI Registration

In `src/Vanalytics.Api/Program.cs`:

```csharp
using Soverance.Forum.Extensions;
using Soverance.Forum.Services;
// ...
builder.Services.AddForumServices();
builder.Services.AddScoped<IForumAuthorResolver, VanalyticsForumAuthorResolver>();
```

## ForumController

**File:** `src/Vanalytics.Api/Controllers/ForumController.cs`

**Constructor:**
```csharp
public ForumController(IForumService forumService, IForumAuthorResolver authorResolver)
```

Route: `api/forum`

### Public Endpoints (no auth)

| Method | Route | Status | Description |
|--------|-------|--------|-------------|
| GET | `/api/forum/categories` | 200 | List all categories |
| GET | `/api/forum/categories/{slug}` | 200 / 404 | Get category by slug |
| GET | `/api/forum/categories/{slug}/threads?afterLastPostAtTicks&afterId&limit` | 200 / 404 | Paginated thread list (404 if category not found) |
| GET | `/api/forum/categories/{categorySlug}/threads/{threadSlug}` | 200 / 404 | Get thread detail |
| GET | `/api/forum/threads/{threadId}/posts?afterId&limit` | 200 | Paginated post list |

For the posts endpoint, if the request includes a valid JWT (optional), the `currentUserId` is extracted to populate `CurrentUserVoted` in responses. Anonymous requests get `false` for all votes.

### Authenticated Endpoints (Members+)

| Method | Route | Status | Description |
|--------|-------|--------|-------------|
| POST | `/api/forum/categories/{slug}/threads` | 201 / 404 | Create thread (404 if category not found) |
| POST | `/api/forum/threads/{threadId}/posts` | 201 / 404 / 409 | Create post (409 if thread locked) |
| PUT | `/api/forum/posts/{postId}` | 200 / 403 / 404 | Edit own post (403 if not author) |
| DELETE | `/api/forum/posts/{postId}` | 204 / 403 / 404 | Soft-delete own post (403 if not author) |
| POST | `/api/forum/posts/{postId}/vote` | 200 | Toggle upvote (returns new count + voted state) |

### Moderator+ Endpoints

| Method | Route | Status | Description |
|--------|-------|--------|-------------|
| POST | `/api/forum/categories` | 201 | Create category |
| PUT | `/api/forum/categories/{id}` | 200 / 404 | Update category |
| DELETE | `/api/forum/categories/{id}` | 204 / 409 | Delete category (409 if has threads) |
| PUT | `/api/forum/threads/{threadId}/pin` | 200 / 404 | Toggle pin |
| PUT | `/api/forum/threads/{threadId}/lock` | 200 / 404 | Toggle lock |
| PUT | `/api/forum/posts/{postId}/moderate` | 200 / 404 | Edit any post |
| DELETE | `/api/forum/posts/{postId}/moderate` | 204 / 404 | Soft-delete any post |

### Auth Extraction Pattern

Uses `ClaimTypes.NameIdentifier` consistent with all existing controllers:

```csharp
private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
private bool IsModerator() => User.IsInRole("Moderator") || User.IsInRole("Admin");
```

For public endpoints that optionally use auth (posts list with vote status):

```csharp
private Guid? GetOptionalUserId()
{
    var sub = User.FindFirstValue(ClaimTypes.NameIdentifier);
    return sub != null ? Guid.Parse(sub) : null;
}
```

### Input Validation

The controller validates required fields and lengths before calling the service:

- Thread title: required, max 200 characters
- Post body: required, non-empty
- Category name: required, max 100 characters
- Category description: max 500 characters

Returns 400 Bad Request with a message for invalid input. This prevents database constraint violations from surfacing as 500 errors.

### Response Enrichment

The controller enriches responses from `IForumService` with author info from `IForumAuthorResolver`. For thread lists and post lists:

1. Collect unique author IDs from the response
2. Call `IForumAuthorResolver.ResolveAuthorsAsync(authorIds)`
3. Merge author info into the response — missing authors (deleted users) get fallback values: username `"[deleted]"`, null avatar, 0 post count

**Enriched DTOs** live in `src/Vanalytics.Api/DTOs/ForumEnrichedDtos.cs`:

```csharp
public record EnrichedPostResponse(
    long Id, Guid AuthorId, string? Body, bool IsEdited, bool IsDeleted,
    int VoteCount, bool CurrentUserVoted,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt,
    string AuthorUsername, string? AuthorAvatarHash, int AuthorPostCount, DateTimeOffset AuthorJoinedAt);

public record EnrichedThreadSummaryResponse(
    int Id, string Title, string Slug, bool IsPinned, bool IsLocked,
    Guid AuthorId, int ReplyCount, int VoteCount,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt,
    string AuthorUsername, string? AuthorAvatarHash);
```

## VanalyticsForumAuthorResolver

**File:** `src/Vanalytics.Api/Services/VanalyticsForumAuthorResolver.cs`

Injects `VanalyticsDbContext` (not base `DbContext`) for type safety:

```csharp
public class VanalyticsForumAuthorResolver : IForumAuthorResolver
{
    private readonly VanalyticsDbContext _db;

    public VanalyticsForumAuthorResolver(VanalyticsDbContext db) { _db = db; }

    public async Task<Dictionary<Guid, ForumAuthorInfo>> ResolveAuthorsAsync(IEnumerable<Guid> authorIds)
    {
        var ids = authorIds.Distinct().ToList();

        var users = await _db.Set<User>()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.Username, u.Email, u.CreatedAt })
            .ToListAsync();

        var postCounts = await _db.Set<ForumPost>()
            .Where(p => ids.Contains(p.AuthorId) && !p.IsDeleted)
            .GroupBy(p => p.AuthorId)
            .Select(g => new { AuthorId = g.Key, Count = g.Count() })
            .ToListAsync();

        var countMap = postCounts.ToDictionary(x => x.AuthorId, x => x.Count);

        return users.ToDictionary(
            u => u.Id,
            u => new ForumAuthorInfo(
                u.Id,
                u.Username,
                u.Email,
                countMap.GetValueOrDefault(u.Id),
                u.CreatedAt));
    }
}
```

Note: `AvatarHash` passes the user's email — the frontend `UserAvatar` component generates the visual avatar from the username. The post count `GROUP BY` query is acceptable for initial volume; if performance degrades, denormalize to a cached count column (Phase 4 candidate).

## Integration Tests

**File:** `tests/Vanalytics.Api.Tests/Controllers/ForumControllerTests.cs`

Using the existing Testcontainers + WebApplicationFactory pattern. Tests cover:

- **Public access:** GET categories, threads, posts without auth returns 200
- **Auth required:** POST/PUT/DELETE without auth returns 401
- **Moderator required:** Category create/delete without moderator role returns 403
- **Category CRUD:** Create, update, delete (moderator only), delete non-empty returns 409
- **Thread creation:** Authenticated user creates thread, gets 201 with enriched response
- **Post creation:** Reply to thread, verify post appears in list
- **Locked thread:** POST to locked thread returns 409
- **Edit permissions:** Non-author edit returns 403, author edit returns 200, moderator edit via `/moderate` returns 200
- **Soft delete:** Delete sets isDeleted, body stripped in GET response
- **Voting:** Toggle vote, verify count changes, verify CurrentUserVoted flag
- **Enriched responses:** Author info (username, avatar, post count, join date) populated in responses
- **Pagination:** Cursor-based pagination for posts, verify HasMore flag
- **Input validation:** Empty title returns 400, oversized input returns 400
