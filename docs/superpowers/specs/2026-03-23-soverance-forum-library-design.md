# Soverance.Forum Library (Phase 1)

**Date:** 2026-03-23
**Phase:** 1 of 4 (Phase 2: API endpoints, Phase 3: Frontend, Phase 4: Search/attachments/notifications)

## Overview

Create a reusable `Soverance.Forum` library in the Common repo alongside Soverance.Auth and Soverance.Data. The library provides entity models, EF Core configurations, DTOs, and a service layer for a community forum with flat categories, linear threads, upvoting, and moderation. It has no ASP.NET Core dependency — consuming apps provide their own controllers and user resolution.

## Scope

Phase 1 covers the library only. No API endpoints, no frontend, no migrations. The consuming app (Vanalytics) integrates the library in Phase 2.

## Dependencies

`Soverance.Forum` references **neither** `Soverance.Auth` nor `Soverance.Data`. It depends only on:
- `Microsoft.EntityFrameworkCore` (for entity configurations and DbContext access)
- `Microsoft.Extensions.DependencyInjection.Abstractions` (for `IServiceCollection` extension)

`ForumService` injects `DbContext` (the EF Core base class). At runtime, the consuming app's concrete context (e.g., `VanalyticsDbContext`) is resolved. This works because the existing `DataExtensions.AddSoveranceSqlServer<T>()` registers the concrete context as both `T` and `DbContext`.

## DbContext Integration

The consuming app must register the forum entity configurations in its `OnModelCreating`. The library provides an extension method:

```csharp
// In Soverance.Forum/Extensions/ForumModelBuilderExtensions.cs
public static class ForumModelBuilderExtensions
{
    public static ModelBuilder ApplyForumConfigurations(this ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ForumCategory).Assembly);
        return modelBuilder;
    }
}
```

The consuming app calls this in its DbContext:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
    modelBuilder.ApplyForumConfigurations(); // adds forum tables
}
```

## Project Structure

```
Common/src/Soverance.Forum/
├── Soverance.Forum.csproj
├── Models/
│   ├── ForumCategory.cs
│   ├── ForumThread.cs
│   ├── ForumPost.cs
│   └── ForumVote.cs
├── Configurations/
│   ├── ForumCategoryConfiguration.cs
│   ├── ForumThreadConfiguration.cs
│   ├── ForumPostConfiguration.cs
│   └── ForumVoteConfiguration.cs
├── DTOs/
│   └── ForumDtos.cs
├── Services/
│   ├── IForumService.cs
│   ├── ForumService.cs
│   └── IForumAuthorResolver.cs
└── Extensions/
    ├── ForumServiceExtensions.cs
    └── ForumModelBuilderExtensions.cs
```

## Entity Models

All `AuthorId` and `UserId` fields use `Guid` to match the existing `User.Id` type in Soverance.Auth.

### ForumCategory

```csharp
public class ForumCategory
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public List<ForumThread> Threads { get; set; } = [];
}
```

### ForumThread

```csharp
public class ForumThread
{
    public int Id { get; set; }
    public int CategoryId { get; set; }
    public Guid AuthorId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public bool IsPinned { get; set; }
    public bool IsLocked { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastPostAt { get; set; }
    public ForumCategory Category { get; set; } = null!;
    public List<ForumPost> Posts { get; set; } = [];
}
```

Note: `UpdatedAt` removed — no thread editing is in scope for Phase 1. Can be added later if needed.

### ForumPost

```csharp
public class ForumPost
{
    public long Id { get; set; }
    public int ThreadId { get; set; }
    public Guid AuthorId { get; set; }
    public string Body { get; set; } = string.Empty;
    public bool IsEdited { get; set; }
    public bool IsDeleted { get; set; }
    public Guid? DeletedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public ForumThread Thread { get; set; } = null!;
    public List<ForumVote> Votes { get; set; } = [];
}
```

`DeletedBy` records who performed the deletion — the post author or a moderator. Null when not deleted.

### ForumVote

```csharp
public class ForumVote
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ForumPost Post { get; set; } = null!;
}
```

## EF Core Configurations

### ForumCategory
- Primary key: `Id`
- `Name`: required, maxLength 100
- `Slug`: required, maxLength 100, unique index
- `Description`: maxLength 500
- `DisplayOrder`: default 0
- Cascade delete to Threads

### ForumThread
- Primary key: `Id`
- `CategoryId`: required FK to ForumCategory
- `AuthorId`: required
- `Title`: required, maxLength 200
- `Slug`: required, maxLength 200. **Unique index scoped to category: `(CategoryId, Slug)`** — allows the same slug in different categories
- `IsPinned`: default false
- `IsLocked`: default false
- `LastPostAt`: indexed (for efficient sorting)
- Cascade delete to Posts

### ForumPost
- Primary key: `Id` (long — high volume)
- `ThreadId`: required FK to ForumThread
- `AuthorId`: required
- `Body`: required (no max length — markdown content)
- `IsEdited`: default false
- `IsDeleted`: default false
- `DeletedBy`: nullable
- Composite index on `(ThreadId, CreatedAt)` for efficient paginated thread reads
- Cascade delete to Votes

### ForumVote
- Primary key: `Id` (long)
- `PostId`: required FK to ForumPost
- `UserId`: required
- Unique composite index on `(PostId, UserId)` — one vote per user per post

## DTOs

### Request DTOs

```csharp
public record CreateCategoryRequest(string Name, string Description, int DisplayOrder = 0);
public record UpdateCategoryRequest(string Name, string Description, int DisplayOrder);
public record CreateThreadRequest(string Title, string Body);
public record CreatePostRequest(string Body);
public record UpdatePostRequest(string Body);
```

### Response DTOs

```csharp
public record CategoryResponse(
    int Id, string Name, string Slug, string Description,
    int DisplayOrder, int ThreadCount, DateTimeOffset? LastActivityAt);

public record ThreadSummaryResponse(
    int Id, string Title, string Slug, bool IsPinned, bool IsLocked,
    Guid AuthorId, int ReplyCount, int VoteCount,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt);

public record ThreadDetailResponse(
    int Id, string Title, string Slug, int CategoryId, string CategoryName, string CategorySlug,
    bool IsPinned, bool IsLocked, Guid AuthorId,
    DateTimeOffset CreatedAt, DateTimeOffset LastPostAt);

public record PostResponse(
    long Id, Guid AuthorId, string? Body, bool IsEdited, bool IsDeleted,
    int VoteCount, bool CurrentUserVoted,
    DateTimeOffset CreatedAt, DateTimeOffset? UpdatedAt);
```

Notes:
- `PostResponse.Body` is null when `IsDeleted` is true — the service strips it
- `CurrentUserVoted` is resolved per-request based on the calling user's ID (false for unauthenticated)
- Author display info (username, avatar, post count, join date) is NOT in these DTOs — the consuming app enriches responses via `IForumAuthorResolver`

## IForumAuthorResolver

```csharp
public interface IForumAuthorResolver
{
    Task<Dictionary<Guid, ForumAuthorInfo>> ResolveAuthorsAsync(IEnumerable<Guid> authorIds);
}

public record ForumAuthorInfo(
    Guid UserId, string Username, string? AvatarHash,
    int PostCount, DateTimeOffset JoinedAt);
```

The consuming app implements this interface to map author IDs to display info. The service calls it in bulk (passing all unique author IDs from a page of results) to avoid N+1 queries. `PostCount` is the user's total forum post count — the consuming app's resolver can compute this with a COUNT query against ForumPost, or cache/denormalize if performance becomes an issue.

## IForumService Interface

```csharp
public interface IForumService
{
    // Categories
    Task<List<CategoryResponse>> GetCategoriesAsync();
    Task<CategoryResponse?> GetCategoryBySlugAsync(string slug);
    Task<CategoryResponse> CreateCategoryAsync(CreateCategoryRequest request);
    Task<CategoryResponse?> UpdateCategoryAsync(int id, UpdateCategoryRequest request);
    Task<bool> DeleteCategoryAsync(int id);  // returns false if category has threads or not found

    // Threads
    Task<(List<ThreadSummaryResponse> Threads, bool HasMore)> GetThreadsAsync(
        string categorySlug, long? afterLastPostAt = null, int? afterId = null, int limit = 25);
    Task<ThreadDetailResponse?> GetThreadBySlugAsync(string categorySlug, string threadSlug);
    Task<ThreadDetailResponse?> CreateThreadAsync(
        string categorySlug, CreateThreadRequest request, Guid authorId);
    Task<bool> TogglePinAsync(int threadId);
    Task<bool> ToggleLockAsync(int threadId);

    // Posts
    Task<(List<PostResponse> Posts, bool HasMore)> GetPostsAsync(
        int threadId, long? afterId = null, int limit = 25, Guid? currentUserId = null);
    Task<PostResponse?> CreatePostAsync(
        int threadId, CreatePostRequest request, Guid authorId);
    Task<PostResponse?> UpdatePostAsync(long postId, UpdatePostRequest request, Guid callerId, bool isModerator);
    Task<bool> DeletePostAsync(long postId, Guid callerId, bool isModerator);

    // Voting
    Task<(int VoteCount, bool UserVoted)> ToggleVoteAsync(long postId, Guid userId);
}
```

**Permission model:** The service does not check roles internally. It takes `callerId` and `isModerator` flags where needed. The consuming app's controller is responsible for extracting these from the auth context and passing them in. This keeps the library framework-agnostic.

**Slug generation:** When creating categories or threads, the service generates slugs from the name/title (lowercase, hyphenated, stripped of special characters). If a slug collision occurs (within the same category for threads, globally for categories), it appends a numeric suffix (e.g., `bug-reports-2`).

**Thread creation:** `CreateThreadAsync` creates both the thread and its first post atomically. The `Body` in `CreateThreadRequest` becomes the first post's body.

**Soft delete behavior:** `DeletePostAsync` sets `IsDeleted = true` and `DeletedBy` to the caller's ID. It does not erase the `Body` from the database. The service strips the body in `GetPostsAsync` responses (returns `Body = null` for deleted posts). This preserves the ability to audit deleted content if needed.

**Delete category behavior:** `DeleteCategoryAsync` returns `false` if the category has any threads (non-empty) or if the category is not found. The consuming controller can distinguish these cases by checking existence first if needed. Categories must be emptied before deletion.

## Pagination

**Thread list:** Uses a composite cursor `(LastPostAt, Id)` to handle the sort-by-activity ordering correctly. The `afterLastPostAt` (as ticks/epoch) and `afterId` parameters together define the cursor position. Pinned threads always appear first, before any cursor-based results. Sorted by `LastPostAt` desc, then `Id` desc as tiebreaker.

**Post list:** Uses `afterId` (post ID). Sorted by `CreatedAt` asc (chronological). This works correctly because post IDs are monotonically increasing and correlate with creation order.

`HasMore` boolean indicates whether more results exist beyond the current page. Default page size: 25.

## Csproj

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.5" />
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="10.0.5" />
  </ItemGroup>
</Project>
```

No ASP.NET Core framework reference — only EF Core and DI abstractions. This keeps the library usable from any .NET host.

## ForumServiceExtensions

```csharp
public static class ForumServiceExtensions
{
    public static IServiceCollection AddForumServices(this IServiceCollection services)
    {
        services.AddScoped<IForumService, ForumService>();
        return services;
    }
}
```

The consuming app calls `builder.Services.AddForumServices()` and registers its own `IForumAuthorResolver` implementation.

## Testing

Unit tests for `ForumService` using SQLite in-memory provider. Test project: `Common/tests/Soverance.Forum.Tests/` using xUnit (consistent with Vanalytics test projects).

Test coverage:

- Category CRUD (create, update, delete, delete-with-threads-returns-false)
- Thread creation (creates first post, generates slug, handles slug collision within category)
- Thread listing (pagination with composite cursor, pinned-first ordering)
- Thread slug uniqueness scoped to category (same slug allowed in different categories)
- Post CRUD (create, edit sets isEdited, delete sets isDeleted + deletedBy)
- Post permissions (user can edit/delete own, moderator can edit/delete any, user cannot edit/delete others')
- Voting (toggle on, toggle off, one-per-user enforcement, vote count accuracy)
- Soft delete behavior (body stripped in responses, placeholder preserved, deletedBy recorded)
- Pagination (cursor-based for both threads and posts, hasMore flag)
- CreatePost on locked thread (should fail)
