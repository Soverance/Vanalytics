# Soverance.Forum Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable `Soverance.Forum` library in the Common repo with entity models, EF Core configurations, DTOs, and a service layer for a community forum with categories, threads, posts, upvoting, and moderation.

**Architecture:** The library lives in `Common/src/Soverance.Forum/` alongside Soverance.Auth and Soverance.Data. It depends only on EF Core and DI abstractions — no ASP.NET Core reference. `ForumService` injects `DbContext` (resolved as the consuming app's concrete context at runtime). Entity configurations are applied via a `ModelBuilder.ApplyForumConfigurations()` extension method. Tests use xUnit with SQLite in-memory.

**Tech Stack:** .NET 10, EF Core 10, xUnit, SQLite in-memory for tests

**Spec:** `docs/superpowers/specs/2026-03-23-soverance-forum-library-design.md`

---

## File Structure

### Library (`Common/src/Soverance.Forum/`)
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `Soverance.Forum.csproj` | Project file — EF Core + DI abstractions |
| Create | `Models/ForumCategory.cs` | Category entity |
| Create | `Models/ForumThread.cs` | Thread entity |
| Create | `Models/ForumPost.cs` | Post entity |
| Create | `Models/ForumVote.cs` | Vote entity |
| Create | `Configurations/ForumCategoryConfiguration.cs` | Category EF config |
| Create | `Configurations/ForumThreadConfiguration.cs` | Thread EF config |
| Create | `Configurations/ForumPostConfiguration.cs` | Post EF config |
| Create | `Configurations/ForumVoteConfiguration.cs` | Vote EF config |
| Create | `DTOs/ForumDtos.cs` | Request + response DTOs |
| Create | `Services/IForumService.cs` | Service interface |
| Create | `Services/IForumAuthorResolver.cs` | Author resolver interface + ForumAuthorInfo record |
| Create | `Services/ForumService.cs` | Service implementation |
| Create | `Services/SlugGenerator.cs` | Slug generation utility |
| Create | `Extensions/ForumServiceExtensions.cs` | DI registration |
| Create | `Extensions/ForumModelBuilderExtensions.cs` | ModelBuilder configuration |

### Tests (`Common/tests/Soverance.Forum.Tests/`)
| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `Soverance.Forum.Tests.csproj` | Test project — xUnit + SQLite |
| Create | `TestDbContext.cs` | Minimal DbContext for testing |
| Create | `ForumServiceTests.cs` | All service tests |

### Solution
| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `Common/Soverance.Common.slnx` | Add Forum project + test project |

---

## Task 1: Project scaffolding and entity models

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/Soverance.Forum.csproj`
- Create: `src/lib/Common/src/Soverance.Forum/Models/ForumCategory.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Models/ForumThread.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Models/ForumPost.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Models/ForumVote.cs`

- [ ] **Step 1: Create the csproj**

Create `src/lib/Common/src/Soverance.Forum/Soverance.Forum.csproj`:

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

- [ ] **Step 2: Create ForumCategory model**

Create `src/lib/Common/src/Soverance.Forum/Models/ForumCategory.cs`:

```csharp
namespace Soverance.Forum.Models;

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

- [ ] **Step 3: Create ForumThread model**

Create `src/lib/Common/src/Soverance.Forum/Models/ForumThread.cs`:

```csharp
namespace Soverance.Forum.Models;

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

- [ ] **Step 4: Create ForumPost model**

Create `src/lib/Common/src/Soverance.Forum/Models/ForumPost.cs`:

```csharp
namespace Soverance.Forum.Models;

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

- [ ] **Step 5: Create ForumVote model**

Create `src/lib/Common/src/Soverance.Forum/Models/ForumVote.cs`:

```csharp
namespace Soverance.Forum.Models;

public class ForumVote
{
    public long Id { get; set; }
    public long PostId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ForumPost Post { get; set; } = null!;
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/src/Soverance.Forum && dotnet build`
Expected: Build succeeded

- [ ] **Step 7: Commit**

```bash
git add src/lib/Common/src/Soverance.Forum/
git commit -m "feat(forum): add Soverance.Forum project with entity models"
```

---

## Task 2: EF Core configurations

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/Configurations/ForumCategoryConfiguration.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Configurations/ForumThreadConfiguration.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Configurations/ForumPostConfiguration.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Configurations/ForumVoteConfiguration.cs`

- [ ] **Step 1: Create ForumCategoryConfiguration**

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Forum.Models;

namespace Soverance.Forum.Configurations;

public class ForumCategoryConfiguration : IEntityTypeConfiguration<ForumCategory>
{
    public void Configure(EntityTypeBuilder<ForumCategory> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.Name)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(c => c.Slug)
            .IsRequired()
            .HasMaxLength(100);

        builder.HasIndex(c => c.Slug)
            .IsUnique();

        builder.Property(c => c.Description)
            .HasMaxLength(500);

        builder.Property(c => c.DisplayOrder)
            .HasDefaultValue(0);

        builder.HasMany(c => c.Threads)
            .WithOne(t => t.Category)
            .HasForeignKey(t => t.CategoryId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 2: Create ForumThreadConfiguration**

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Forum.Models;

namespace Soverance.Forum.Configurations;

public class ForumThreadConfiguration : IEntityTypeConfiguration<ForumThread>
{
    public void Configure(EntityTypeBuilder<ForumThread> builder)
    {
        builder.HasKey(t => t.Id);

        builder.Property(t => t.AuthorId)
            .IsRequired();

        builder.Property(t => t.Title)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(t => t.Slug)
            .IsRequired()
            .HasMaxLength(200);

        builder.HasIndex(t => new { t.CategoryId, t.Slug })
            .IsUnique();

        builder.Property(t => t.IsPinned)
            .HasDefaultValue(false);

        builder.Property(t => t.IsLocked)
            .HasDefaultValue(false);

        builder.HasIndex(t => t.LastPostAt);

        builder.HasMany(t => t.Posts)
            .WithOne(p => p.Thread)
            .HasForeignKey(p => p.ThreadId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 3: Create ForumPostConfiguration**

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Forum.Models;

namespace Soverance.Forum.Configurations;

public class ForumPostConfiguration : IEntityTypeConfiguration<ForumPost>
{
    public void Configure(EntityTypeBuilder<ForumPost> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.AuthorId)
            .IsRequired();

        builder.Property(p => p.Body)
            .IsRequired();

        builder.Property(p => p.IsEdited)
            .HasDefaultValue(false);

        builder.Property(p => p.IsDeleted)
            .HasDefaultValue(false);

        builder.HasIndex(p => new { p.ThreadId, p.CreatedAt });

        builder.HasMany(p => p.Votes)
            .WithOne(v => v.Post)
            .HasForeignKey(v => v.PostId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 4: Create ForumVoteConfiguration**

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Forum.Models;

namespace Soverance.Forum.Configurations;

public class ForumVoteConfiguration : IEntityTypeConfiguration<ForumVote>
{
    public void Configure(EntityTypeBuilder<ForumVote> builder)
    {
        builder.HasKey(v => v.Id);

        builder.Property(v => v.UserId)
            .IsRequired();

        builder.HasIndex(v => new { v.PostId, v.UserId })
            .IsUnique();
    }
}
```

- [ ] **Step 5: Verify it builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/src/Soverance.Forum && dotnet build`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add src/lib/Common/src/Soverance.Forum/Configurations/
git commit -m "feat(forum): add EF Core entity configurations"
```

---

## Task 3: DTOs, interfaces, and extensions

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/DTOs/ForumDtos.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Services/IForumService.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Services/IForumAuthorResolver.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Extensions/ForumServiceExtensions.cs`
- Create: `src/lib/Common/src/Soverance.Forum/Extensions/ForumModelBuilderExtensions.cs`

- [ ] **Step 1: Create ForumDtos**

Create `src/lib/Common/src/Soverance.Forum/DTOs/ForumDtos.cs`:

```csharp
namespace Soverance.Forum.DTOs;

// Request DTOs
public record CreateCategoryRequest(string Name, string Description, int DisplayOrder = 0);
public record UpdateCategoryRequest(string Name, string Description, int DisplayOrder);
public record CreateThreadRequest(string Title, string Body);
public record CreatePostRequest(string Body);
public record UpdatePostRequest(string Body);

// Response DTOs
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

- [ ] **Step 2: Create IForumAuthorResolver**

Create `src/lib/Common/src/Soverance.Forum/Services/IForumAuthorResolver.cs`:

```csharp
namespace Soverance.Forum.Services;

public interface IForumAuthorResolver
{
    Task<Dictionary<Guid, ForumAuthorInfo>> ResolveAuthorsAsync(IEnumerable<Guid> authorIds);
}

public record ForumAuthorInfo(
    Guid UserId, string Username, string? AvatarHash,
    int PostCount, DateTimeOffset JoinedAt);
```

- [ ] **Step 3: Create IForumService**

Create `src/lib/Common/src/Soverance.Forum/Services/IForumService.cs`:

```csharp
using Soverance.Forum.DTOs;

namespace Soverance.Forum.Services;

public interface IForumService
{
    // Categories
    Task<List<CategoryResponse>> GetCategoriesAsync();
    Task<CategoryResponse?> GetCategoryBySlugAsync(string slug);
    Task<CategoryResponse> CreateCategoryAsync(CreateCategoryRequest request);
    Task<CategoryResponse?> UpdateCategoryAsync(int id, UpdateCategoryRequest request);
    Task<bool> DeleteCategoryAsync(int id);

    // Threads
    Task<(List<ThreadSummaryResponse> Threads, bool HasMore)> GetThreadsAsync(
        string categorySlug, long? afterLastPostAtTicks = null, int? afterId = null, int limit = 25);
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

- [ ] **Step 4: Create ForumServiceExtensions**

Create `src/lib/Common/src/Soverance.Forum/Extensions/ForumServiceExtensions.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Soverance.Forum.Services;

namespace Soverance.Forum.Extensions;

public static class ForumServiceExtensions
{
    public static IServiceCollection AddForumServices(this IServiceCollection services)
    {
        services.AddScoped<IForumService, ForumService>();
        return services;
    }
}
```

- [ ] **Step 5: Create ForumModelBuilderExtensions**

Create `src/lib/Common/src/Soverance.Forum/Extensions/ForumModelBuilderExtensions.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.Models;

namespace Soverance.Forum.Extensions;

public static class ForumModelBuilderExtensions
{
    public static ModelBuilder ApplyForumConfigurations(this ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ForumCategory).Assembly);
        return modelBuilder;
    }
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/src/Soverance.Forum && dotnet build`
Expected: Build succeeded

- [ ] **Step 7: Commit**

```bash
git add src/lib/Common/src/Soverance.Forum/DTOs/ src/lib/Common/src/Soverance.Forum/Services/IForumService.cs src/lib/Common/src/Soverance.Forum/Services/IForumAuthorResolver.cs src/lib/Common/src/Soverance.Forum/Extensions/
git commit -m "feat(forum): add DTOs, service interface, and extension methods"
```

---

## Task 4: Slug generator utility

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/Services/SlugGenerator.cs`

- [ ] **Step 1: Create SlugGenerator**

```csharp
using System.Text.RegularExpressions;

namespace Soverance.Forum.Services;

public static partial class SlugGenerator
{
    public static string Generate(string input)
    {
        var slug = input.ToLowerInvariant().Trim();
        slug = NonAlphanumericRegex().Replace(slug, "-");
        slug = MultipleHyphenRegex().Replace(slug, "-");
        slug = slug.Trim('-');
        return slug.Length == 0 ? "untitled" : slug;
    }

    public static string AppendSuffix(string slug, int suffix)
    {
        return $"{slug}-{suffix}";
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlphanumericRegex();

    [GeneratedRegex("-{2,}")]
    private static partial Regex MultipleHyphenRegex();
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/src/Soverance.Forum && dotnet build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add src/lib/Common/src/Soverance.Forum/Services/SlugGenerator.cs
git commit -m "feat(forum): add slug generator utility"
```

---

## Task 5: ForumService implementation

**Files:**
- Create: `src/lib/Common/src/Soverance.Forum/Services/ForumService.cs`

- [ ] **Step 1: Create ForumService**

This is the largest file. Create `src/lib/Common/src/Soverance.Forum/Services/ForumService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.DTOs;
using Soverance.Forum.Models;

namespace Soverance.Forum.Services;

public class ForumService : IForumService
{
    private readonly DbContext _db;

    public ForumService(DbContext db)
    {
        _db = db;
    }

    // === Categories ===

    public async Task<List<CategoryResponse>> GetCategoriesAsync()
    {
        return await _db.Set<ForumCategory>()
            .OrderBy(c => c.DisplayOrder)
            .ThenBy(c => c.Name)
            .Select(c => new CategoryResponse(
                c.Id, c.Name, c.Slug, c.Description, c.DisplayOrder,
                c.Threads.Count,
                c.Threads.SelectMany(t => t.Posts).Max(p => (DateTimeOffset?)p.CreatedAt)))
            .ToListAsync();
    }

    public async Task<CategoryResponse?> GetCategoryBySlugAsync(string slug)
    {
        return await _db.Set<ForumCategory>()
            .Where(c => c.Slug == slug)
            .Select(c => new CategoryResponse(
                c.Id, c.Name, c.Slug, c.Description, c.DisplayOrder,
                c.Threads.Count,
                c.Threads.SelectMany(t => t.Posts).Max(p => (DateTimeOffset?)p.CreatedAt)))
            .FirstOrDefaultAsync();
    }

    public async Task<CategoryResponse> CreateCategoryAsync(CreateCategoryRequest request)
    {
        var slug = await GenerateUniqueCategorySlugAsync(request.Name);

        var category = new ForumCategory
        {
            Name = request.Name,
            Slug = slug,
            Description = request.Description,
            DisplayOrder = request.DisplayOrder,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.Set<ForumCategory>().Add(category);
        await _db.SaveChangesAsync();

        return new CategoryResponse(
            category.Id, category.Name, category.Slug, category.Description,
            category.DisplayOrder, 0, null);
    }

    public async Task<CategoryResponse?> UpdateCategoryAsync(int id, UpdateCategoryRequest request)
    {
        var category = await _db.Set<ForumCategory>().FindAsync(id);
        if (category == null) return null;

        category.Name = request.Name;
        category.Description = request.Description;
        category.DisplayOrder = request.DisplayOrder;

        await _db.SaveChangesAsync();

        var threadCount = await _db.Set<ForumThread>().CountAsync(t => t.CategoryId == id);
        var lastActivity = await _db.Set<ForumPost>()
            .Where(p => p.Thread.CategoryId == id)
            .MaxAsync(p => (DateTimeOffset?)p.CreatedAt);

        return new CategoryResponse(
            category.Id, category.Name, category.Slug, category.Description,
            category.DisplayOrder, threadCount, lastActivity);
    }

    public async Task<bool> DeleteCategoryAsync(int id)
    {
        var category = await _db.Set<ForumCategory>()
            .Include(c => c.Threads)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (category == null || category.Threads.Count > 0) return false;

        _db.Set<ForumCategory>().Remove(category);
        await _db.SaveChangesAsync();
        return true;
    }

    // === Threads ===

    public async Task<(List<ThreadSummaryResponse> Threads, bool HasMore)> GetThreadsAsync(
        string categorySlug, long? afterLastPostAtTicks = null, int? afterId = null, int limit = 25)
    {
        var category = await _db.Set<ForumCategory>()
            .FirstOrDefaultAsync(c => c.Slug == categorySlug);

        if (category == null) return ([], false);

        // Pinned threads first (always shown, not affected by cursor)
        var pinned = await _db.Set<ForumThread>()
            .Where(t => t.CategoryId == category.Id && t.IsPinned)
            .OrderByDescending(t => t.LastPostAt)
            .Select(t => MapThreadSummary(t))
            .ToListAsync();

        // Non-pinned threads with cursor pagination
        var query = _db.Set<ForumThread>()
            .Where(t => t.CategoryId == category.Id && !t.IsPinned);

        if (afterLastPostAtTicks != null && afterId != null)
        {
            var afterDate = new DateTimeOffset(afterLastPostAtTicks.Value, TimeSpan.Zero);
            query = query.Where(t =>
                t.LastPostAt < afterDate ||
                (t.LastPostAt == afterDate && t.Id < afterId.Value));
        }

        var threads = await query
            .OrderByDescending(t => t.LastPostAt)
            .ThenByDescending(t => t.Id)
            .Take(limit + 1)
            .Select(t => MapThreadSummary(t))
            .ToListAsync();

        var hasMore = threads.Count > limit;
        if (hasMore) threads = threads.Take(limit).ToList();

        // Only include pinned threads on the first page
        if (afterLastPostAtTicks == null)
            return ([.. pinned, .. threads], hasMore);

        return (threads, hasMore);
    }

    public async Task<ThreadDetailResponse?> GetThreadBySlugAsync(string categorySlug, string threadSlug)
    {
        return await _db.Set<ForumThread>()
            .Where(t => t.Category.Slug == categorySlug && t.Slug == threadSlug)
            .Select(t => new ThreadDetailResponse(
                t.Id, t.Title, t.Slug, t.CategoryId, t.Category.Name, t.Category.Slug,
                t.IsPinned, t.IsLocked, t.AuthorId,
                t.CreatedAt, t.LastPostAt))
            .FirstOrDefaultAsync();
    }

    public async Task<ThreadDetailResponse?> CreateThreadAsync(
        string categorySlug, CreateThreadRequest request, Guid authorId)
    {
        var category = await _db.Set<ForumCategory>()
            .FirstOrDefaultAsync(c => c.Slug == categorySlug);

        if (category == null) return null;

        var slug = await GenerateUniqueThreadSlugAsync(category.Id, request.Title);
        var now = DateTimeOffset.UtcNow;

        var thread = new ForumThread
        {
            CategoryId = category.Id,
            AuthorId = authorId,
            Title = request.Title,
            Slug = slug,
            CreatedAt = now,
            LastPostAt = now
        };

        _db.Set<ForumThread>().Add(thread);
        await _db.SaveChangesAsync();

        // Create first post
        var post = new ForumPost
        {
            ThreadId = thread.Id,
            AuthorId = authorId,
            Body = request.Body,
            CreatedAt = now
        };

        _db.Set<ForumPost>().Add(post);
        await _db.SaveChangesAsync();

        return new ThreadDetailResponse(
            thread.Id, thread.Title, thread.Slug, category.Id, category.Name, category.Slug,
            thread.IsPinned, thread.IsLocked, thread.AuthorId,
            thread.CreatedAt, thread.LastPostAt);
    }

    public async Task<bool> TogglePinAsync(int threadId)
    {
        var thread = await _db.Set<ForumThread>().FindAsync(threadId);
        if (thread == null) return false;

        thread.IsPinned = !thread.IsPinned;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> ToggleLockAsync(int threadId)
    {
        var thread = await _db.Set<ForumThread>().FindAsync(threadId);
        if (thread == null) return false;

        thread.IsLocked = !thread.IsLocked;
        await _db.SaveChangesAsync();
        return true;
    }

    // === Posts ===

    public async Task<(List<PostResponse> Posts, bool HasMore)> GetPostsAsync(
        int threadId, long? afterId = null, int limit = 25, Guid? currentUserId = null)
    {
        var query = _db.Set<ForumPost>()
            .Where(p => p.ThreadId == threadId);

        if (afterId != null)
            query = query.Where(p => p.Id > afterId.Value);

        var posts = await query
            .OrderBy(p => p.CreatedAt)
            .ThenBy(p => p.Id)
            .Take(limit + 1)
            .Select(p => new PostResponse(
                p.Id,
                p.AuthorId,
                p.IsDeleted ? null : p.Body,
                p.IsEdited,
                p.IsDeleted,
                p.Votes.Count,
                currentUserId != null && p.Votes.Any(v => v.UserId == currentUserId.Value),
                p.CreatedAt,
                p.UpdatedAt))
            .ToListAsync();

        var hasMore = posts.Count > limit;
        if (hasMore) posts = posts.Take(limit).ToList();

        return (posts, hasMore);
    }

    public async Task<PostResponse?> CreatePostAsync(
        int threadId, CreatePostRequest request, Guid authorId)
    {
        var thread = await _db.Set<ForumThread>().FindAsync(threadId);
        if (thread == null || thread.IsLocked) return null;

        var now = DateTimeOffset.UtcNow;
        var post = new ForumPost
        {
            ThreadId = threadId,
            AuthorId = authorId,
            Body = request.Body,
            CreatedAt = now
        };

        _db.Set<ForumPost>().Add(post);

        // Update thread's LastPostAt
        thread.LastPostAt = now;

        await _db.SaveChangesAsync();

        return new PostResponse(
            post.Id, post.AuthorId, post.Body, false, false, 0, false,
            post.CreatedAt, null);
    }

    public async Task<PostResponse?> UpdatePostAsync(
        long postId, UpdatePostRequest request, Guid callerId, bool isModerator)
    {
        var post = await _db.Set<ForumPost>()
            .Include(p => p.Votes)
            .FirstOrDefaultAsync(p => p.Id == postId);

        if (post == null || post.IsDeleted) return null;
        if (post.AuthorId != callerId && !isModerator) return null;

        post.Body = request.Body;
        post.IsEdited = true;
        post.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        return new PostResponse(
            post.Id, post.AuthorId, post.Body, post.IsEdited, post.IsDeleted,
            post.Votes.Count,
            post.Votes.Any(v => v.UserId == callerId),
            post.CreatedAt, post.UpdatedAt);
    }

    public async Task<bool> DeletePostAsync(long postId, Guid callerId, bool isModerator)
    {
        var post = await _db.Set<ForumPost>().FindAsync(postId);
        if (post == null || post.IsDeleted) return false;
        if (post.AuthorId != callerId && !isModerator) return false;

        post.IsDeleted = true;
        post.DeletedBy = callerId;

        await _db.SaveChangesAsync();
        return true;
    }

    // === Voting ===

    public async Task<(int VoteCount, bool UserVoted)> ToggleVoteAsync(long postId, Guid userId)
    {
        var existing = await _db.Set<ForumVote>()
            .FirstOrDefaultAsync(v => v.PostId == postId && v.UserId == userId);

        if (existing != null)
        {
            _db.Set<ForumVote>().Remove(existing);
        }
        else
        {
            _db.Set<ForumVote>().Add(new ForumVote
            {
                PostId = postId,
                UserId = userId,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await _db.SaveChangesAsync();

        var voteCount = await _db.Set<ForumVote>().CountAsync(v => v.PostId == postId);
        var userVoted = existing == null; // toggled ON if it wasn't there before

        return (voteCount, userVoted);
    }

    // === Helpers ===

    private static ThreadSummaryResponse MapThreadSummary(ForumThread t)
    {
        return new ThreadSummaryResponse(
            t.Id, t.Title, t.Slug, t.IsPinned, t.IsLocked,
            t.AuthorId,
            t.Posts.Count - 1, // ReplyCount excludes the first post
            t.Posts.SelectMany(p => p.Votes).Count(),
            t.CreatedAt, t.LastPostAt);
    }

    private async Task<string> GenerateUniqueCategorySlugAsync(string name)
    {
        var baseSlug = SlugGenerator.Generate(name);
        var slug = baseSlug;
        var suffix = 1;

        while (await _db.Set<ForumCategory>().AnyAsync(c => c.Slug == slug))
        {
            suffix++;
            slug = SlugGenerator.AppendSuffix(baseSlug, suffix);
        }

        return slug;
    }

    private async Task<string> GenerateUniqueThreadSlugAsync(int categoryId, string title)
    {
        var baseSlug = SlugGenerator.Generate(title);
        var slug = baseSlug;
        var suffix = 1;

        while (await _db.Set<ForumThread>().AnyAsync(t => t.CategoryId == categoryId && t.Slug == slug))
        {
            suffix++;
            slug = SlugGenerator.AppendSuffix(baseSlug, suffix);
        }

        return slug;
    }
}
```

**Note:** The `MapThreadSummary` method uses EF navigation properties (`t.Posts`, `t.Posts.SelectMany(p => p.Votes)`) which requires the query to include those relationships. The `GetThreadsAsync` method uses `Select()` projection which EF Core translates to SQL — this works in the LINQ-to-SQL translation without explicit `Include()`.

- [ ] **Step 2: Verify it builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/src/Soverance.Forum && dotnet build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add src/lib/Common/src/Soverance.Forum/Services/ForumService.cs
git commit -m "feat(forum): implement ForumService with full CRUD, voting, and moderation"
```

---

## Task 6: Update solution file

**Files:**
- Modify: `src/lib/Common/Soverance.Common.slnx`

- [ ] **Step 1: Read and update the solution file**

Read `src/lib/Common/Soverance.Common.slnx`, then add the new project entries. The `.slnx` format lists projects as XML elements. Add:

```xml
<Project Path="src/Soverance.Forum/Soverance.Forum.csproj" />
<Project Path="tests/Soverance.Forum.Tests/Soverance.Forum.Tests.csproj" />
```

(Add the test project entry now even though it doesn't exist yet — it will be created in Task 7.)

- [ ] **Step 2: Verify the solution builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common && dotnet build Soverance.Common.slnx`
Expected: Build succeeded (test project warning is OK since it doesn't exist yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/Common/Soverance.Common.slnx
git commit -m "feat(forum): add Forum project to solution"
```

---

## Task 7: Test project and tests

**Files:**
- Create: `src/lib/Common/tests/Soverance.Forum.Tests/Soverance.Forum.Tests.csproj`
- Create: `src/lib/Common/tests/Soverance.Forum.Tests/TestDbContext.cs`
- Create: `src/lib/Common/tests/Soverance.Forum.Tests/ForumServiceTests.cs`

- [ ] **Step 1: Create test project csproj**

Create `src/lib/Common/tests/Soverance.Forum.Tests/Soverance.Forum.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.2" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.0" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.5" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\Soverance.Forum\Soverance.Forum.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Create TestDbContext**

Create `src/lib/Common/tests/Soverance.Forum.Tests/TestDbContext.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.Extensions;

namespace Soverance.Forum.Tests;

public class TestDbContext : DbContext
{
    public TestDbContext(DbContextOptions<TestDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyForumConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
```

- [ ] **Step 3: Create ForumServiceTests**

Create `src/lib/Common/tests/Soverance.Forum.Tests/ForumServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Soverance.Forum.DTOs;
using Soverance.Forum.Models;
using Soverance.Forum.Services;

namespace Soverance.Forum.Tests;

public class ForumServiceTests : IDisposable
{
    private readonly TestDbContext _db;
    private readonly ForumService _service;

    public ForumServiceTests()
    {
        var options = new DbContextOptionsBuilder<TestDbContext>()
            .UseSqlite("DataSource=:memory:")
            .Options;

        _db = new TestDbContext(options);
        _db.Database.OpenConnection();
        _db.Database.EnsureCreated();
        _service = new ForumService(_db);
    }

    public void Dispose()
    {
        _db.Database.CloseConnection();
        _db.Dispose();
    }

    // === Category Tests ===

    [Fact]
    public async Task CreateCategory_ReturnsCategory()
    {
        var result = await _service.CreateCategoryAsync(
            new CreateCategoryRequest("Bug Reports", "Report bugs here", 1));

        Assert.Equal("Bug Reports", result.Name);
        Assert.Equal("bug-reports", result.Slug);
        Assert.Equal("Report bugs here", result.Description);
        Assert.Equal(1, result.DisplayOrder);
        Assert.Equal(0, result.ThreadCount);
    }

    [Fact]
    public async Task CreateCategory_DuplicateName_AppendsSuffix()
    {
        await _service.CreateCategoryAsync(new CreateCategoryRequest("General", "First"));
        var second = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", "Second"));

        Assert.Equal("general-2", second.Slug);
    }

    [Fact]
    public async Task GetCategories_ReturnsOrderedList()
    {
        await _service.CreateCategoryAsync(new CreateCategoryRequest("Zebra", "Z", 2));
        await _service.CreateCategoryAsync(new CreateCategoryRequest("Alpha", "A", 1));

        var result = await _service.GetCategoriesAsync();

        Assert.Equal(2, result.Count);
        Assert.Equal("Alpha", result[0].Name);
        Assert.Equal("Zebra", result[1].Name);
    }

    [Fact]
    public async Task UpdateCategory_UpdatesFields()
    {
        var created = await _service.CreateCategoryAsync(new CreateCategoryRequest("Old", "Old desc"));
        var updated = await _service.UpdateCategoryAsync(created.Id,
            new UpdateCategoryRequest("New", "New desc", 5));

        Assert.NotNull(updated);
        Assert.Equal("New", updated!.Name);
        Assert.Equal("New desc", updated.Description);
        Assert.Equal(5, updated.DisplayOrder);
    }

    [Fact]
    public async Task DeleteCategory_EmptyCategory_ReturnsTrue()
    {
        var created = await _service.CreateCategoryAsync(new CreateCategoryRequest("ToDelete", ""));
        var result = await _service.DeleteCategoryAsync(created.Id);
        Assert.True(result);
    }

    [Fact]
    public async Task DeleteCategory_WithThreads_ReturnsFalse()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("HasThreads", ""));
        await _service.CreateThreadAsync(category.Slug,
            new CreateThreadRequest("Thread", "Body"), Guid.NewGuid());

        var result = await _service.DeleteCategoryAsync(category.Id);
        Assert.False(result);
    }

    [Fact]
    public async Task DeleteCategory_NotFound_ReturnsFalse()
    {
        var result = await _service.DeleteCategoryAsync(999);
        Assert.False(result);
    }

    // === Thread Tests ===

    [Fact]
    public async Task CreateThread_CreatesThreadAndFirstPost()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();

        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("My Thread", "Hello world"), authorId);

        Assert.NotNull(thread);
        Assert.Equal("My Thread", thread!.Title);
        Assert.Equal("my-thread", thread.Slug);
        Assert.Equal(authorId, thread.AuthorId);

        // Verify first post was created
        var (posts, _) = await _service.GetPostsAsync(thread.Id);
        Assert.Single(posts);
        Assert.Equal("Hello world", posts[0].Body);
        Assert.Equal(authorId, posts[0].AuthorId);
    }

    [Fact]
    public async Task CreateThread_SlugCollisionInSameCategory_AppendsSuffix()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();

        var first = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("Test", "Body"), authorId);
        var second = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("Test", "Body 2"), authorId);

        Assert.Equal("test", first!.Slug);
        Assert.Equal("test-2", second!.Slug);
    }

    [Fact]
    public async Task CreateThread_SameSlugDifferentCategory_Allowed()
    {
        var cat1 = await _service.CreateCategoryAsync(new CreateCategoryRequest("Cat 1", ""));
        var cat2 = await _service.CreateCategoryAsync(new CreateCategoryRequest("Cat 2", ""));
        var authorId = Guid.NewGuid();

        var t1 = await _service.CreateThreadAsync(cat1.Slug, new CreateThreadRequest("Test", "Body"), authorId);
        var t2 = await _service.CreateThreadAsync(cat2.Slug, new CreateThreadRequest("Test", "Body"), authorId);

        Assert.Equal("test", t1!.Slug);
        Assert.Equal("test", t2!.Slug);
    }

    [Fact]
    public async Task GetThreads_PinnedFirst()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();

        var normal = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("Normal", "Body"), authorId);
        var pinned = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("Pinned", "Body"), authorId);

        await _service.TogglePinAsync(pinned!.Id);

        var (threads, _) = await _service.GetThreadsAsync(category.Slug);

        Assert.Equal("Pinned", threads[0].Title);
        Assert.True(threads[0].IsPinned);
        Assert.Equal("Normal", threads[1].Title);
    }

    [Fact]
    public async Task TogglePin_TogglesState()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        await _service.TogglePinAsync(thread!.Id);
        var detail = await _service.GetThreadBySlugAsync(category.Slug, thread.Slug);
        Assert.True(detail!.IsPinned);

        await _service.TogglePinAsync(thread.Id);
        detail = await _service.GetThreadBySlugAsync(category.Slug, thread.Slug);
        Assert.False(detail!.IsPinned);
    }

    [Fact]
    public async Task ToggleLock_TogglesState()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        await _service.ToggleLockAsync(thread!.Id);
        var detail = await _service.GetThreadBySlugAsync(category.Slug, thread.Slug);
        Assert.True(detail!.IsLocked);
    }

    // === Post Tests ===

    [Fact]
    public async Task CreatePost_AddsReplyAndUpdatesLastPostAt()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "First"), Guid.NewGuid());

        var replyAuthor = Guid.NewGuid();
        var reply = await _service.CreatePostAsync(
            thread!.Id, new CreatePostRequest("Reply!"), replyAuthor);

        Assert.NotNull(reply);
        Assert.Equal("Reply!", reply!.Body);
        Assert.Equal(replyAuthor, reply.AuthorId);

        // Thread's LastPostAt should be updated
        var updatedThread = await _service.GetThreadBySlugAsync(category.Slug, thread.Slug);
        Assert.True(updatedThread!.LastPostAt >= thread.LastPostAt);
    }

    [Fact]
    public async Task CreatePost_OnLockedThread_ReturnsNull()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        await _service.ToggleLockAsync(thread!.Id);

        var result = await _service.CreatePostAsync(
            thread.Id, new CreatePostRequest("Nope"), Guid.NewGuid());

        Assert.Null(result);
    }

    [Fact]
    public async Task UpdatePost_ByAuthor_SetsIsEdited()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "Original"), authorId);

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var post = posts[0];

        var updated = await _service.UpdatePostAsync(
            post.Id, new UpdatePostRequest("Edited"), authorId, false);

        Assert.NotNull(updated);
        Assert.Equal("Edited", updated!.Body);
        Assert.True(updated.IsEdited);
        Assert.NotNull(updated.UpdatedAt);
    }

    [Fact]
    public async Task UpdatePost_ByOtherUser_ReturnsNull()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), authorId);

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);

        var result = await _service.UpdatePostAsync(
            posts[0].Id, new UpdatePostRequest("Hacked"), Guid.NewGuid(), false);

        Assert.Null(result);
    }

    [Fact]
    public async Task UpdatePost_ByModerator_Succeeds()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);

        var result = await _service.UpdatePostAsync(
            posts[0].Id, new UpdatePostRequest("Moderated"), Guid.NewGuid(), true);

        Assert.NotNull(result);
        Assert.Equal("Moderated", result!.Body);
    }

    [Fact]
    public async Task DeletePost_SoftDeletes_StripsBodyInResponse()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "Secret content"), authorId);

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var postId = posts[0].Id;

        var deleted = await _service.DeletePostAsync(postId, authorId, false);
        Assert.True(deleted);

        var (postsAfter, _) = await _service.GetPostsAsync(thread.Id);
        Assert.Single(postsAfter);
        Assert.True(postsAfter[0].IsDeleted);
        Assert.Null(postsAfter[0].Body); // Body stripped
    }

    [Fact]
    public async Task DeletePost_RecordsDeletedBy()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();
        var moderatorId = Guid.NewGuid();
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), authorId);

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);

        await _service.DeletePostAsync(posts[0].Id, moderatorId, true);

        var post = await _db.Set<ForumPost>().FindAsync(posts[0].Id);
        Assert.Equal(moderatorId, post!.DeletedBy);
    }

    [Fact]
    public async Task DeletePost_ByOtherNonModerator_ReturnsFalse()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);

        var result = await _service.DeletePostAsync(posts[0].Id, Guid.NewGuid(), false);
        Assert.False(result);
    }

    // === Voting Tests ===

    [Fact]
    public async Task ToggleVote_AddsVote()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var userId = Guid.NewGuid();

        var (count, voted) = await _service.ToggleVoteAsync(posts[0].Id, userId);

        Assert.Equal(1, count);
        Assert.True(voted);
    }

    [Fact]
    public async Task ToggleVote_RemovesExistingVote()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var userId = Guid.NewGuid();

        await _service.ToggleVoteAsync(posts[0].Id, userId);
        var (count, voted) = await _service.ToggleVoteAsync(posts[0].Id, userId);

        Assert.Equal(0, count);
        Assert.False(voted);
    }

    [Fact]
    public async Task ToggleVote_MultipleUsers_CountsCorrectly()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var postId = posts[0].Id;

        await _service.ToggleVoteAsync(postId, Guid.NewGuid());
        await _service.ToggleVoteAsync(postId, Guid.NewGuid());
        var (count, _) = await _service.ToggleVoteAsync(postId, Guid.NewGuid());

        Assert.Equal(3, count);
    }

    [Fact]
    public async Task GetPosts_IncludesCurrentUserVoted()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "B"), Guid.NewGuid());

        var (posts, _) = await _service.GetPostsAsync(thread!.Id);
        var userId = Guid.NewGuid();
        await _service.ToggleVoteAsync(posts[0].Id, userId);

        var (postsWithVote, _) = await _service.GetPostsAsync(thread.Id, currentUserId: userId);
        Assert.True(postsWithVote[0].CurrentUserVoted);

        var (postsWithoutVote, _) = await _service.GetPostsAsync(thread.Id, currentUserId: Guid.NewGuid());
        Assert.False(postsWithoutVote[0].CurrentUserVoted);
    }

    // === Pagination Tests ===

    [Fact]
    public async Task GetPosts_Pagination_HasMore()
    {
        var category = await _service.CreateCategoryAsync(new CreateCategoryRequest("General", ""));
        var authorId = Guid.NewGuid();
        var thread = await _service.CreateThreadAsync(
            category.Slug, new CreateThreadRequest("T", "First"), authorId);

        // Add more replies (first post already exists)
        for (var i = 0; i < 3; i++)
            await _service.CreatePostAsync(thread!.Id, new CreatePostRequest($"Reply {i}"), authorId);

        // Page of 2: should get 2 posts, hasMore = true
        var (page1, hasMore1) = await _service.GetPostsAsync(thread!.Id, limit: 2);
        Assert.Equal(2, page1.Count);
        Assert.True(hasMore1);

        // Next page starting after last post ID
        var (page2, hasMore2) = await _service.GetPostsAsync(thread.Id, afterId: page1[^1].Id, limit: 2);
        Assert.Equal(2, page2.Count);
        Assert.False(hasMore2);
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/tests/Soverance.Forum.Tests && dotnet test -v normal`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/Common/tests/Soverance.Forum.Tests/
git commit -m "test(forum): add ForumService unit tests with SQLite in-memory"
```

---

## Task 8: Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify the full solution builds**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common && dotnet build Soverance.Common.slnx`
Expected: Build succeeded

- [ ] **Step 2: Run all tests**

Run: `cd C:/Git/soverance/Vanalytics/src/lib/Common/tests/Soverance.Forum.Tests && dotnet test -v normal`
Expected: All tests pass (should be ~25 tests)

- [ ] **Step 3: Verify the library can be referenced by Vanalytics**

This is a smoke test — just verify the project reference would work:
Run: `cd C:/Git/soverance/Vanalytics/src/Vanalytics.Api && dotnet build --no-restore`
Expected: Build succeeded (the Forum project isn't referenced yet, but existing projects should still build)
