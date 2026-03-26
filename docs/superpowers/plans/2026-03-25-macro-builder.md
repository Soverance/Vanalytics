# Macro Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync FFXI macros between the game client (via Windower addon) and a web-based macro editor in Vanalytics.

**Architecture:** Three-layer feature — entity models + EF Core persistence, dual API surface (ApiKey auth for addon sync, JWT auth for web UI CRUD), React macro editor with 3D page reel, and Lua addon DAT file parsing/writing with hash-based change detection. The addon parses/writes the FFXI binary DAT format; the API and frontend work with structured JSON.

**Tech Stack:** ASP.NET Core 10, EF Core, SQL Server, React 19, Tailwind CSS v4, Lua 5.1 (Windower)

**Spec:** `docs/superpowers/specs/2026-03-25-macro-builder-design.md`

---

### Task 1: Entity Models

**Files:**
- Create: `src/Vanalytics.Core/Models/MacroBook.cs`
- Create: `src/Vanalytics.Core/Models/MacroPage.cs`
- Create: `src/Vanalytics.Core/Models/Macro.cs`

- [ ] **Step 1: Create MacroBook entity**

```csharp
// src/Vanalytics.Core/Models/MacroBook.cs
namespace Vanalytics.Core.Models;

public class MacroBook
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
    public List<MacroPage> Pages { get; set; } = [];
}
```

- [ ] **Step 2: Create MacroPage entity**

```csharp
// src/Vanalytics.Core/Models/MacroPage.cs
namespace Vanalytics.Core.Models;

public class MacroPage
{
    public Guid Id { get; set; }
    public Guid MacroBookId { get; set; }
    public int PageNumber { get; set; }

    public MacroBook Book { get; set; } = null!;
    public List<Macro> Macros { get; set; } = [];
}
```

- [ ] **Step 3: Create Macro entity**

```csharp
// src/Vanalytics.Core/Models/Macro.cs
namespace Vanalytics.Core.Models;

public class Macro
{
    public Guid Id { get; set; }
    public Guid MacroPageId { get; set; }
    public string Set { get; set; } = string.Empty; // "Ctrl" or "Alt"
    public int Position { get; set; } // 1-10
    public string Name { get; set; } = string.Empty;
    public int Icon { get; set; }
    public string Line1 { get; set; } = string.Empty;
    public string Line2 { get; set; } = string.Empty;
    public string Line3 { get; set; } = string.Empty;
    public string Line4 { get; set; } = string.Empty;
    public string Line5 { get; set; } = string.Empty;
    public string Line6 { get; set; } = string.Empty;

    public MacroPage Page { get; set; } = null!;
}
```

- [ ] **Step 4: Add navigation property to Character**

Add to `src/Vanalytics.Core/Models/Character.cs`, after the `CraftingSkills` property:

```csharp
public List<MacroBook> MacroBooks { get; set; } = [];
```

- [ ] **Step 5: Commit**

```
feat: add MacroBook, MacroPage, and Macro entity models
```

---

### Task 2: EF Core Configurations

**Files:**
- Create: `src/Vanalytics.Data/Configurations/MacroBookConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/MacroPageConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/MacroConfiguration.cs`

- [ ] **Step 1: Create MacroBookConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/MacroBookConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroBookConfiguration : IEntityTypeConfiguration<MacroBook>
{
    public void Configure(EntityTypeBuilder<MacroBook> builder)
    {
        builder.HasKey(b => b.Id);
        builder.HasIndex(b => new { b.CharacterId, b.BookNumber }).IsUnique();
        builder.Property(b => b.BookNumber).IsRequired();
        builder.Property(b => b.ContentHash).HasMaxLength(64).IsRequired();
        builder.Property(b => b.PendingPush).HasDefaultValue(false);
        builder.HasOne(b => b.Character)
            .WithMany(c => c.MacroBooks)
            .HasForeignKey(b => b.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 2: Create MacroPageConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/MacroPageConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroPageConfiguration : IEntityTypeConfiguration<MacroPage>
{
    public void Configure(EntityTypeBuilder<MacroPage> builder)
    {
        builder.HasKey(p => p.Id);
        builder.HasIndex(p => new { p.MacroBookId, p.PageNumber }).IsUnique();
        builder.Property(p => p.PageNumber).IsRequired();
        builder.HasOne(p => p.Book)
            .WithMany(b => b.Pages)
            .HasForeignKey(p => p.MacroBookId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 3: Create MacroConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/MacroConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroConfiguration : IEntityTypeConfiguration<Macro>
{
    public void Configure(EntityTypeBuilder<Macro> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => new { m.MacroPageId, m.Set, m.Position }).IsUnique();
        builder.Property(m => m.Set).HasMaxLength(4).IsRequired();
        builder.Property(m => m.Position).IsRequired();
        builder.Property(m => m.Name).HasMaxLength(8);
        builder.Property(m => m.Line1).HasMaxLength(61);
        builder.Property(m => m.Line2).HasMaxLength(61);
        builder.Property(m => m.Line3).HasMaxLength(61);
        builder.Property(m => m.Line4).HasMaxLength(61);
        builder.Property(m => m.Line5).HasMaxLength(61);
        builder.Property(m => m.Line6).HasMaxLength(61);
        builder.HasOne(m => m.Page)
            .WithMany(p => p.Macros)
            .HasForeignKey(m => m.MacroPageId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

Note: Line max length is 61 (57 chars + a few bytes of padding in the DAT format). Adjust if DAT parsing reveals tighter limits.

- [ ] **Step 4: Commit**

```
feat: add EF Core configurations for macro entities
```

---

### Task 3: DbContext Registration + Migration

**Files:**
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`
- Create: migration via `dotnet ef`

- [ ] **Step 1: Register DbSets in VanalyticsDbContext**

Add these three lines after the existing `DbSet` declarations in `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
public DbSet<MacroBook> MacroBooks => Set<MacroBook>();
public DbSet<MacroPage> MacroPages => Set<MacroPage>();
public DbSet<Macro> Macros => Set<Macro>();
```

Add the using at the top if not already present:
```csharp
using Vanalytics.Core.Models;
```

- [ ] **Step 2: Generate the EF migration**

Run from the repo root:
```bash
cd src/Vanalytics.Api && dotnet ef migrations add AddMacroTables --project ../Vanalytics.Data/Vanalytics.Data.csproj
```

- [ ] **Step 3: Verify the migration**

Open the generated migration file under `src/Vanalytics.Data/Migrations/` and verify it creates three tables (`MacroBooks`, `MacroPages`, `Macros`) with the correct columns, unique indexes, and cascade delete foreign keys.

- [ ] **Step 4: Commit**

```
feat: register macro DbSets and add migration
```

---

### Task 4: DTOs

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Sync/MacroSyncRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Macros/MacroBookResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Macros/MacroBookUpdateRequest.cs`

- [ ] **Step 1: Create MacroSyncRequest (addon → API)**

```csharp
// src/Vanalytics.Core/DTOs/Sync/MacroSyncRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class MacroSyncRequest
{
    [Required]
    public List<MacroSyncBook> Books { get; set; } = [];
}

public class MacroSyncBook
{
    [Range(1, 20)]
    public int BookNumber { get; set; }

    [Required, MaxLength(64)]
    public string ContentHash { get; set; } = string.Empty;

    [Required]
    public List<MacroSyncPage> Pages { get; set; } = [];
}

public class MacroSyncPage
{
    [Range(1, 10)]
    public int PageNumber { get; set; }

    [Required]
    public List<MacroSyncEntry> Macros { get; set; } = [];
}

public class MacroSyncEntry
{
    [Required, RegularExpression("^(Ctrl|Alt)$")]
    public string Set { get; set; } = string.Empty;

    [Range(1, 10)]
    public int Position { get; set; }

    [MaxLength(8)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 255)]
    public int Icon { get; set; }

    [MaxLength(61)]
    public string Line1 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line2 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line3 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line4 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line5 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line6 { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create MacroBookResponse (API → web UI and addon)**

```csharp
// src/Vanalytics.Core/DTOs/Macros/MacroBookResponse.cs
namespace Vanalytics.Core.DTOs.Macros;

public class MacroBookSummary
{
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public bool IsEmpty { get; set; }
    public string PreviewLabel { get; set; } = string.Empty;
    public DateTimeOffset UpdatedAt { get; set; }
}

public class MacroBookDetail
{
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<MacroPageDetail> Pages { get; set; } = [];
}

public class MacroPageDetail
{
    public int PageNumber { get; set; }
    public List<MacroDetail> Macros { get; set; } = [];
}

public class MacroDetail
{
    public string Set { get; set; } = string.Empty;
    public int Position { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Icon { get; set; }
    public string Line1 { get; set; } = string.Empty;
    public string Line2 { get; set; } = string.Empty;
    public string Line3 { get; set; } = string.Empty;
    public string Line4 { get; set; } = string.Empty;
    public string Line5 { get; set; } = string.Empty;
    public string Line6 { get; set; } = string.Empty;
}
```

- [ ] **Step 3: Create MacroBookUpdateRequest (web UI → API)**

```csharp
// src/Vanalytics.Core/DTOs/Macros/MacroBookUpdateRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Macros;

public class MacroBookUpdateRequest
{
    [Required]
    public List<MacroPageUpdate> Pages { get; set; } = [];
}

public class MacroPageUpdate
{
    [Range(1, 10)]
    public int PageNumber { get; set; }

    [Required]
    public List<MacroUpdate> Macros { get; set; } = [];
}

public class MacroUpdate
{
    [Required, RegularExpression("^(Ctrl|Alt)$")]
    public string Set { get; set; } = string.Empty;

    [Range(1, 10)]
    public int Position { get; set; }

    [MaxLength(8)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 255)]
    public int Icon { get; set; }

    [MaxLength(61)]
    public string Line1 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line2 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line3 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line4 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line5 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line6 { get; set; } = string.Empty;
}
```

- [ ] **Step 4: Commit**

```
feat: add macro sync and CRUD DTOs
```

---

### Task 5: Macro Sync Controller (Addon-Facing)

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/SyncController.cs`

This adds macro sync endpoints to the existing SyncController, which already has ApiKey auth and rate limiting.

- [ ] **Step 1: Write test for macro upload**

Create `tests/Vanalytics.Api.Tests/Controllers/MacroSyncTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class MacroSyncTests : IAsyncLifetime
{
    private readonly Testcontainers.MsSql.MsSqlContainer _container =
        new Testcontainers.MsSql.MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = TestHelper.CreateFactory(_container.GetConnectionString());
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task SyncMacros_UploadsAndStoresBooks()
    {
        var (_, apiKey) = await TestHelper.SetupSyncUserAsync(_client);

        var payload = new MacroSyncRequest
        {
            Books =
            [
                new MacroSyncBook
                {
                    BookNumber = 1,
                    ContentHash = "abc123",
                    Pages =
                    [
                        new MacroSyncPage
                        {
                            PageNumber = 1,
                            Macros =
                            [
                                new MacroSyncEntry
                                {
                                    Set = "Ctrl", Position = 1,
                                    Name = "Cure IV", Icon = 5,
                                    Line1 = "/ma \"Cure IV\" <stpt>",
                                    Line2 = "", Line3 = "", Line4 = "",
                                    Line5 = "", Line6 = ""
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync/macros");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);

        // First sync to create character
        await TestHelper.SyncCharacterAsync(_client, apiKey, "MacroChar", "Asura");

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var book = await db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.BookNumber == 1);

        Assert.NotNull(book);
        Assert.Equal("abc123", book.ContentHash);
        Assert.Single(book.Pages);
        Assert.Single(book.Pages[0].Macros);
        Assert.Equal("Cure IV", book.Pages[0].Macros[0].Name);
    }

    [Fact]
    public async Task GetPending_ReturnsEmptyWhenNoPendingBooks()
    {
        var (_, apiKey) = await TestHelper.SetupSyncUserAsync(_client);
        await TestHelper.SyncCharacterAsync(_client, apiKey, "PendChar", "Asura");

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/sync/macros/pending");
        req.Headers.Add("X-Api-Key", apiKey);

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<PendingResponse>();
        Assert.NotNull(body);
        Assert.Empty(body!.PendingBooks);
    }
}

file record PendingResponse(int[] PendingBooks);
```

Note: `TestHelper` is a shared utility — if it doesn't exist, extract the `SetupSyncUserAsync` and factory creation patterns from the existing `SyncControllerTests.cs` into a shared helper. If the existing tests inline these, replicate the same pattern.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tests/Vanalytics.Api.Tests && dotnet test --filter "MacroSyncTests" -v n
```

Expected: Compilation errors (endpoints don't exist yet).

- [ ] **Step 3: Add macro sync endpoints to SyncController**

Add these methods to `src/Vanalytics.Api/Controllers/SyncController.cs`. Add the required usings at the top:

```csharp
using Vanalytics.Core.DTOs.Macros;
```

Add these endpoints after the existing `Sync` method:

```csharp
[HttpPost("macros")]
public async Task<IActionResult> SyncMacros([FromBody] MacroSyncRequest request)
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var apiKey = Request.Headers["X-Api-Key"].ToString();
    if (!_rateLimiter.IsAllowed(apiKey))
        return StatusCode(429, new { message = "Rate limit exceeded." });

    // Find the character owned by this user (most recently synced)
    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.UserId == userId);
    if (character is null)
        return NotFound(new { message = "No character found. Sync character data first." });

    foreach (var bookEntry in request.Books)
    {
        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookEntry.BookNumber);

        if (book is null)
        {
            book = new MacroBook
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                BookNumber = bookEntry.BookNumber,
                ContentHash = bookEntry.ContentHash,
                PendingPush = false,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.MacroBooks.Add(book);
        }
        else
        {
            // Clear existing pages/macros for this book
            await _db.Macros
                .Where(m => m.Page.MacroBookId == book.Id)
                .ExecuteDeleteAsync();
            await _db.MacroPages
                .Where(p => p.MacroBookId == book.Id)
                .ExecuteDeleteAsync();

            book.ContentHash = bookEntry.ContentHash;
            book.PendingPush = false;
            book.UpdatedAt = DateTimeOffset.UtcNow;
        }

        foreach (var pageEntry in bookEntry.Pages)
        {
            var page = new MacroPage
            {
                Id = Guid.NewGuid(),
                MacroBookId = book.Id,
                PageNumber = pageEntry.PageNumber
            };
            _db.MacroPages.Add(page);

            foreach (var macroEntry in pageEntry.Macros)
            {
                _db.Macros.Add(new Macro
                {
                    Id = Guid.NewGuid(),
                    MacroPageId = page.Id,
                    Set = macroEntry.Set,
                    Position = macroEntry.Position,
                    Name = macroEntry.Name,
                    Icon = macroEntry.Icon,
                    Line1 = macroEntry.Line1,
                    Line2 = macroEntry.Line2,
                    Line3 = macroEntry.Line3,
                    Line4 = macroEntry.Line4,
                    Line5 = macroEntry.Line5,
                    Line6 = macroEntry.Line6
                });
            }
        }
    }

    await _db.SaveChangesAsync();
    return Ok(new { message = "Macros synced", booksUpdated = request.Books.Count });
}

[HttpGet("macros/pending")]
public async Task<IActionResult> GetPendingMacros()
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.UserId == userId);
    if (character is null)
        return Ok(new { pendingBooks = Array.Empty<int>() });

    var pending = await _db.MacroBooks
        .Where(b => b.CharacterId == character.Id && b.PendingPush)
        .Select(b => b.BookNumber)
        .OrderBy(n => n)
        .ToArrayAsync();

    return Ok(new { pendingBooks = pending });
}

[HttpGet("macros/{bookNumber:int}")]
public async Task<IActionResult> GetMacroBook(int bookNumber)
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.UserId == userId);
    if (character is null)
        return NotFound(new { message = "No character found." });

    var book = await _db.MacroBooks
        .Include(b => b.Pages).ThenInclude(p => p.Macros)
        .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookNumber);
    if (book is null)
        return NotFound(new { message = $"Macro book {bookNumber} not found." });

    return Ok(MapBookToDetail(book));
}

[HttpDelete("macros/pending/{bookNumber:int}")]
public async Task<IActionResult> AcknowledgeMacroBook(int bookNumber)
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.UserId == userId);
    if (character is null)
        return NotFound();

    var book = await _db.MacroBooks
        .FirstOrDefaultAsync(b => b.CharacterId == character.Id && b.BookNumber == bookNumber);
    if (book is null)
        return NotFound();

    book.PendingPush = false;
    await _db.SaveChangesAsync();
    return NoContent();
}

private static MacroBookDetail MapBookToDetail(MacroBook book) => new()
{
    BookNumber = book.BookNumber,
    ContentHash = book.ContentHash,
    PendingPush = book.PendingPush,
    UpdatedAt = book.UpdatedAt,
    Pages = book.Pages.OrderBy(p => p.PageNumber).Select(p => new MacroPageDetail
    {
        PageNumber = p.PageNumber,
        Macros = p.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position).Select(m => new MacroDetail
        {
            Set = m.Set,
            Position = m.Position,
            Name = m.Name,
            Icon = m.Icon,
            Line1 = m.Line1,
            Line2 = m.Line2,
            Line3 = m.Line3,
            Line4 = m.Line4,
            Line5 = m.Line5,
            Line6 = m.Line6
        }).ToList()
    }).ToList()
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tests/Vanalytics.Api.Tests && dotnet test --filter "MacroSyncTests" -v n
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```
feat: add macro sync endpoints to SyncController
```

---

### Task 6: Macros Controller (Web UI-Facing)

**Files:**
- Create: `src/Vanalytics.Api/Controllers/MacrosController.cs`

- [ ] **Step 1: Write test for web UI macro endpoints**

Add to `tests/Vanalytics.Api.Tests/Controllers/MacrosControllerTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Vanalytics.Core.DTOs.Macros;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class MacrosControllerTests : IAsyncLifetime
{
    private readonly Testcontainers.MsSql.MsSqlContainer _container =
        new Testcontainers.MsSql.MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = TestHelper.CreateFactory(_container.GetConnectionString());
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task ListBooks_ReturnsEmptyForCharacterWithNoMacros()
    {
        var (jwt, apiKey) = await TestHelper.SetupSyncUserAsync(_client);
        var charId = await TestHelper.SyncCharacterAsync(_client, apiKey, "NomacroChar", "Asura");

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/macros/{charId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var books = await resp.Content.ReadFromJsonAsync<List<MacroBookSummary>>();
        Assert.NotNull(books);
        Assert.Empty(books!);
    }

    [Fact]
    public async Task UpdateBook_SetsPendingPush()
    {
        var (jwt, apiKey) = await TestHelper.SetupSyncUserAsync(_client);
        var charId = await TestHelper.SyncCharacterAsync(_client, apiKey, "EditChar", "Asura");

        // Upload a macro book via sync first
        await TestHelper.SyncMacroBookAsync(_client, apiKey, bookNumber: 1);

        // Update via web UI
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/macros/{charId}/1");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        updateReq.Content = JsonContent.Create(new MacroBookUpdateRequest
        {
            Pages =
            [
                new MacroPageUpdate
                {
                    PageNumber = 1,
                    Macros =
                    [
                        new MacroUpdate
                        {
                            Set = "Ctrl", Position = 1,
                            Name = "Cure V", Icon = 5,
                            Line1 = "/ma \"Cure V\" <stpt>",
                            Line2 = "", Line3 = "", Line4 = "",
                            Line5 = "", Line6 = ""
                        }
                    ]
                }
            ]
        });

        var resp = await _client.SendAsync(updateReq);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var book = await db.MacroBooks.FirstAsync(b => b.CharacterId == charId && b.BookNumber == 1);
        Assert.True(book.PendingPush);
    }
}
```

Note: `TestHelper.SyncMacroBookAsync` and `TestHelper.SyncCharacterAsync` are shared helpers that need to be extracted or created alongside these tests. If the existing test setup doesn't have a shared helper, create one that wraps the registration + API key generation + character sync + macro sync patterns.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tests/Vanalytics.Api.Tests && dotnet test --filter "MacrosControllerTests" -v n
```

Expected: Compilation errors (controller doesn't exist yet).

- [ ] **Step 3: Create MacrosController**

```csharp
// src/Vanalytics.Api/Controllers/MacrosController.cs
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Macros;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/macros")]
[Authorize]
public class MacrosController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public MacrosController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("{characterId:guid}")]
    public async Task<IActionResult> ListBooks(Guid characterId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var books = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .Where(b => b.CharacterId == characterId)
            .OrderBy(b => b.BookNumber)
            .ToListAsync();

        var summaries = books.Select(b =>
        {
            var allMacros = b.Pages.SelectMany(p => p.Macros).ToList();
            var firstNonEmpty = allMacros
                .OrderBy(m => m.Page.PageNumber).ThenBy(m => m.Set).ThenBy(m => m.Position)
                .FirstOrDefault(m => !string.IsNullOrEmpty(m.Name));

            return new MacroBookSummary
            {
                BookNumber = b.BookNumber,
                ContentHash = b.ContentHash,
                PendingPush = b.PendingPush,
                IsEmpty = !allMacros.Any(m => !string.IsNullOrEmpty(m.Name)),
                PreviewLabel = firstNonEmpty?.Name ?? "Empty",
                UpdatedAt = b.UpdatedAt
            };
        }).ToList();

        return Ok(summaries);
    }

    [HttpGet("{characterId:guid}/{bookNumber:int}")]
    public async Task<IActionResult> GetBook(Guid characterId, int bookNumber)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book is null) return NotFound();

        return Ok(MapBookToDetail(book));
    }

    [HttpPut("{characterId:guid}/{bookNumber:int}")]
    public async Task<IActionResult> UpdateBook(Guid characterId, int bookNumber, [FromBody] MacroBookUpdateRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == characterId);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstOrDefaultAsync(b => b.CharacterId == characterId && b.BookNumber == bookNumber);
        if (book is null) return NotFound();

        // Clear existing pages/macros
        await _db.Macros
            .Where(m => m.Page.MacroBookId == book.Id)
            .ExecuteDeleteAsync();
        await _db.MacroPages
            .Where(p => p.MacroBookId == book.Id)
            .ExecuteDeleteAsync();

        // Re-add from request
        foreach (var pageEntry in request.Pages)
        {
            var page = new MacroPage
            {
                Id = Guid.NewGuid(),
                MacroBookId = book.Id,
                PageNumber = pageEntry.PageNumber
            };
            _db.MacroPages.Add(page);

            foreach (var macroEntry in pageEntry.Macros)
            {
                _db.Macros.Add(new Macro
                {
                    Id = Guid.NewGuid(),
                    MacroPageId = page.Id,
                    Set = macroEntry.Set,
                    Position = macroEntry.Position,
                    Name = macroEntry.Name,
                    Icon = macroEntry.Icon,
                    Line1 = macroEntry.Line1,
                    Line2 = macroEntry.Line2,
                    Line3 = macroEntry.Line3,
                    Line4 = macroEntry.Line4,
                    Line5 = macroEntry.Line5,
                    Line6 = macroEntry.Line6
                });
            }
        }

        // Recompute content hash from the new data
        book.ContentHash = ComputeContentHash(request);
        book.PendingPush = true;
        book.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        // Reload to return full detail
        book = await _db.MacroBooks
            .Include(b => b.Pages).ThenInclude(p => p.Macros)
            .FirstAsync(b => b.Id == book.Id);

        return Ok(MapBookToDetail(book));
    }

    private Guid GetUserId() => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static string ComputeContentHash(MacroBookUpdateRequest request)
    {
        var sb = new StringBuilder();
        foreach (var page in request.Pages.OrderBy(p => p.PageNumber))
        {
            foreach (var m in page.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position))
            {
                sb.Append(m.Set).Append(m.Position).Append(m.Name).Append(m.Icon);
                sb.Append(m.Line1).Append(m.Line2).Append(m.Line3);
                sb.Append(m.Line4).Append(m.Line5).Append(m.Line6);
            }
        }
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexStringLower(hash)[..16];
    }

    private static MacroBookDetail MapBookToDetail(MacroBook book) => new()
    {
        BookNumber = book.BookNumber,
        ContentHash = book.ContentHash,
        PendingPush = book.PendingPush,
        UpdatedAt = book.UpdatedAt,
        Pages = book.Pages.OrderBy(p => p.PageNumber).Select(p => new MacroPageDetail
        {
            PageNumber = p.PageNumber,
            Macros = p.Macros.OrderBy(m => m.Set).ThenBy(m => m.Position).Select(m => new MacroDetail
            {
                Set = m.Set,
                Position = m.Position,
                Name = m.Name,
                Icon = m.Icon,
                Line1 = m.Line1,
                Line2 = m.Line2,
                Line3 = m.Line3,
                Line4 = m.Line4,
                Line5 = m.Line5,
                Line6 = m.Line6
            }).ToList()
        }).ToList()
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tests/Vanalytics.Api.Tests && dotnet test --filter "MacrosControllerTests" -v n
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```
feat: add MacrosController for web UI CRUD
```

---

### Task 7: Frontend Types + API Calls

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts` (or wherever TypeScript API types live)
- Create: `src/Vanalytics.Web/src/api/macros.ts`

- [ ] **Step 1: Add TypeScript types**

Check the existing types file location first. If `src/types/api.ts` doesn't exist, create types inline in the API module. Add these types:

```typescript
// src/Vanalytics.Web/src/api/macros.ts
import { api } from './client'

export interface MacroBookSummary {
  bookNumber: number
  contentHash: string
  pendingPush: boolean
  isEmpty: boolean
  previewLabel: string
  updatedAt: string
}

export interface MacroBookDetail {
  bookNumber: number
  contentHash: string
  pendingPush: boolean
  updatedAt: string
  pages: MacroPageDetail[]
}

export interface MacroPageDetail {
  pageNumber: number
  macros: MacroDetail[]
}

export interface MacroDetail {
  set: 'Ctrl' | 'Alt'
  position: number
  name: string
  icon: number
  line1: string
  line2: string
  line3: string
  line4: string
  line5: string
  line6: string
}

export interface MacroBookUpdateRequest {
  pages: {
    pageNumber: number
    macros: {
      set: 'Ctrl' | 'Alt'
      position: number
      name: string
      icon: number
      line1: string
      line2: string
      line3: string
      line4: string
      line5: string
      line6: string
    }[]
  }[]
}

export function listMacroBooks(characterId: string) {
  return api<MacroBookSummary[]>(`/api/macros/${characterId}`)
}

export function getMacroBook(characterId: string, bookNumber: number) {
  return api<MacroBookDetail>(`/api/macros/${characterId}/${bookNumber}`)
}

export function updateMacroBook(characterId: string, bookNumber: number, data: MacroBookUpdateRequest) {
  return api<MacroBookDetail>(`/api/macros/${characterId}/${bookNumber}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}
```

- [ ] **Step 2: Commit**

```
feat: add macro API types and client functions
```

---

### Task 8: Frontend — Macro Page Shell + Routing

**Files:**
- Create: `src/Vanalytics.Web/src/pages/MacroEditorPage.tsx`
- Modify: `src/Vanalytics.Web/src/App.tsx`

- [ ] **Step 1: Create page shell with book list loading**

```typescript
// src/Vanalytics.Web/src/pages/MacroEditorPage.tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { listMacroBooks, getMacroBook, updateMacroBook, MacroBookSummary, MacroBookDetail, MacroDetail } from '../api/macros'
import { ApiError } from '../api/client'

export default function MacroEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [books, setBooks] = useState<MacroBookSummary[]>([])
  const [selectedBook, setSelectedBook] = useState<MacroBookDetail | null>(null)
  const [selectedBookNumber, setSelectedBookNumber] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedMacro, setSelectedMacro] = useState<{ set: 'Ctrl' | 'Alt'; position: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    listMacroBooks(id)
      .then(setBooks)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('Failed to load macros')
      })
      .finally(() => setLoading(false))
  }, [id])

  const selectBook = async (bookNumber: number) => {
    if (!id) return
    setSelectedBookNumber(bookNumber)
    setSelectedMacro(null)
    setCurrentPage(1)
    try {
      const detail = await getMacroBook(id, bookNumber)
      setSelectedBook(detail)
    } catch {
      setError('Failed to load macro book')
    }
  }

  if (loading) return <div className="p-6 text-gray-400">Loading macros...</div>
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (books.length === 0) {
    return (
      <div className="p-6 text-gray-400">
        <p>No macro data synced yet. Use the Windower addon to sync your macros.</p>
        <Link to={`/characters/${id}`} className="text-blue-400 hover:underline text-sm mt-2 block">
          Back to character
        </Link>
      </div>
    )
  }

  return (
    <div className="flex gap-4 p-4 h-full">
      {/* Book Selector */}
      <div className="w-48 flex-shrink-0 space-y-1">
        <Link to={`/characters/${id}`} className="text-blue-400 hover:underline text-sm mb-3 block">
          &larr; Back to character
        </Link>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Macro Books</h3>
        {books.map((book) => (
          <button
            key={book.bookNumber}
            onClick={() => selectBook(book.bookNumber)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              selectedBookNumber === book.bookNumber
                ? 'bg-blue-600 text-white'
                : book.isEmpty
                  ? 'text-gray-600 hover:bg-gray-800'
                  : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Book {book.bookNumber}</span>
              {book.pendingPush && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Pending sync" />}
            </div>
            <div className="text-xs text-gray-500 truncate">{book.previewLabel}</div>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {selectedBook ? (
          <div className="text-gray-400 text-sm">
            Book {selectedBook.bookNumber} loaded — {selectedBook.pages.length} pages.
            {/* MacroPageReel and MacroEditor will be added in subsequent tasks */}
          </div>
        ) : (
          <div className="text-gray-500 text-sm p-4">Select a macro book to view.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route to App.tsx**

Add the import at the top of `src/Vanalytics.Web/src/App.tsx`:

```typescript
import MacroEditorPage from './pages/MacroEditorPage'
```

Add the route inside the `<Layout>` protected routes, near the character routes:

```tsx
<Route path="/characters/:id/macros" element={<ProtectedRoute><MacroEditorPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Add link from CharacterDetailPage**

In `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`, add a "Macros" link near the character header area. Find the section that shows the character name/metadata and add:

```tsx
<Link to={`/characters/${id}/macros`} className="text-blue-400 hover:underline text-sm">
  Macro Editor
</Link>
```

Import `Link` from `react-router-dom` if not already imported.

- [ ] **Step 4: Verify the page loads in the browser**

Navigate to `http://localhost:3000/characters/{some-character-id}/macros` and confirm the page renders with the book list or empty state.

- [ ] **Step 5: Commit**

```
feat: add macro editor page shell with book selector and routing
```

---

### Task 9: Frontend — Macro Grid + Page Reel

**Files:**
- Create: `src/Vanalytics.Web/src/components/macros/MacroPageReel.tsx`
- Create: `src/Vanalytics.Web/src/components/macros/MacroCell.tsx`
- Modify: `src/Vanalytics.Web/src/pages/MacroEditorPage.tsx`

- [ ] **Step 1: Create MacroCell component**

```typescript
// src/Vanalytics.Web/src/components/macros/MacroCell.tsx
import { MacroDetail } from '../../api/macros'

interface MacroCellProps {
  macro: MacroDetail | null
  isSelected: boolean
  onClick: () => void
}

export default function MacroCell({ macro, isSelected, onClick }: MacroCellProps) {
  const isEmpty = !macro || !macro.name
  return (
    <button
      onClick={onClick}
      className={`w-20 h-16 rounded border text-center text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
        isSelected
          ? 'border-blue-400 bg-blue-900/40'
          : isEmpty
            ? 'border-gray-800 bg-gray-900/50 text-gray-700'
            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
      }`}
    >
      {macro && macro.icon > 0 && (
        <span className="text-[10px] text-gray-500">#{macro.icon}</span>
      )}
      <span className="truncate w-full px-1">{isEmpty ? '--' : macro!.name}</span>
    </button>
  )
}
```

- [ ] **Step 2: Create MacroPageReel component**

```typescript
// src/Vanalytics.Web/src/components/macros/MacroPageReel.tsx
import { MacroPageDetail, MacroDetail } from '../../api/macros'
import MacroCell from './MacroCell'

interface MacroPageReelProps {
  pages: MacroPageDetail[]
  currentPage: number
  onPageChange: (page: number) => void
  selectedMacro: { set: 'Ctrl' | 'Alt'; position: number } | null
  onMacroSelect: (set: 'Ctrl' | 'Alt', position: number) => void
}

export default function MacroPageReel({ pages, currentPage, onPageChange, selectedMacro, onMacroSelect }: MacroPageReelProps) {
  const visibleOffsets = [-2, -1, 0, 1, 2]

  const getMacro = (page: MacroPageDetail, set: 'Ctrl' | 'Alt', position: number): MacroDetail | null => {
    return page.macros.find(m => m.set === set && m.position === position) ?? null
  }

  const renderGrid = (page: MacroPageDetail, isCurrent: boolean) => {
    const positions = Array.from({ length: 10 }, (_, i) => i + 1)
    return (
      <div className="flex gap-4">
        {/* Ctrl column */}
        <div>
          <div className="text-[10px] text-gray-500 text-center mb-1">Ctrl</div>
          <div className="flex flex-col gap-1">
            {positions.map(pos => (
              <MacroCell
                key={`ctrl-${pos}`}
                macro={getMacro(page, 'Ctrl', pos)}
                isSelected={isCurrent && selectedMacro?.set === 'Ctrl' && selectedMacro.position === pos}
                onClick={() => isCurrent && onMacroSelect('Ctrl', pos)}
              />
            ))}
          </div>
        </div>
        {/* Alt column */}
        <div>
          <div className="text-[10px] text-gray-500 text-center mb-1">Alt</div>
          <div className="flex flex-col gap-1">
            {positions.map(pos => (
              <MacroCell
                key={`alt-${pos}`}
                macro={getMacro(page, 'Alt', pos)}
                isSelected={isCurrent && selectedMacro?.set === 'Alt' && selectedMacro.position === pos}
                onClick={() => isCurrent && onMacroSelect('Alt', pos)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ perspective: '800px' }}>
        {visibleOffsets.map(offset => {
          const pageNum = currentPage + offset
          const page = pages.find(p => p.pageNumber === pageNum)
          if (!page) return null

          const isCurrent = offset === 0
          const absOffset = Math.abs(offset)
          const scale = 1 - absOffset * 0.15
          const opacity = isCurrent ? 1 : Math.max(0.15, 1 - absOffset * 0.35)
          const translateY = offset * 60
          const rotateX = offset * -8
          const zIndex = 10 - absOffset

          return (
            <div
              key={pageNum}
              className={`transition-all duration-300 ${isCurrent ? '' : 'pointer-events-none'}`}
              style={{
                transform: `translateY(${translateY}px) scale(${scale}) rotateX(${rotateX}deg)`,
                opacity,
                zIndex,
                position: isCurrent ? 'relative' : 'absolute',
                top: isCurrent ? undefined : '0',
                left: isCurrent ? undefined : '0',
                right: isCurrent ? undefined : '0',
              }}
              onClick={() => !isCurrent && onPageChange(pageNum)}
            >
              {isCurrent && (
                <div className="text-xs text-gray-400 text-center mb-2">
                  Page {pageNum} of {pages.length}
                </div>
              )}
              {renderGrid(page, isCurrent)}
            </div>
          )
        })}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="text-gray-400 hover:text-white disabled:text-gray-700 text-sm"
        >
          Prev
        </button>
        <span className="text-gray-500 text-xs">{currentPage} / {pages.length}</span>
        <button
          onClick={() => onPageChange(Math.min(pages.length, currentPage + 1))}
          disabled={currentPage >= pages.length}
          className="text-gray-400 hover:text-white disabled:text-gray-700 text-sm"
        >
          Next
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into MacroEditorPage**

Replace the placeholder `{/* MacroPageReel and MacroEditor will be added in subsequent tasks */}` div in `MacroEditorPage.tsx` with:

```tsx
import MacroPageReel from '../components/macros/MacroPageReel'
```

Replace the placeholder content area inside the `selectedBook` ternary:

```tsx
<MacroPageReel
  pages={selectedBook.pages}
  currentPage={currentPage}
  onPageChange={setCurrentPage}
  selectedMacro={selectedMacro}
  onMacroSelect={(set, position) => setSelectedMacro({ set, position })}
/>
```

- [ ] **Step 4: Verify in browser**

Navigate to the macro editor page for a character that has synced macro data. Confirm the 3D page reel renders with Ctrl/Alt columns, page navigation works, and clicking a cell highlights it.

- [ ] **Step 5: Commit**

```
feat: add macro grid and 3D page reel component
```

---

### Task 10: Frontend — Macro Editor Panel

**Files:**
- Create: `src/Vanalytics.Web/src/components/macros/MacroEditorPanel.tsx`
- Modify: `src/Vanalytics.Web/src/pages/MacroEditorPage.tsx`

- [ ] **Step 1: Create MacroEditorPanel**

```typescript
// src/Vanalytics.Web/src/components/macros/MacroEditorPanel.tsx
import { useState, useEffect } from 'react'
import { MacroDetail } from '../../api/macros'

const SLASH_COMMANDS = [
  '/ma', '/ja', '/ws', '/pet', '/equip', '/wait',
  '/echo', '/p', '/l', '/s', '/sh', '/t', '/item',
  '/ra', '/range', '/shoot', '/jobchange', '/lockstyleset',
  '/dance', '/bow', '/kneel', '/wave', '/cheer', '/clap',
]

interface MacroEditorPanelProps {
  macro: MacroDetail
  onSave: (updated: MacroDetail) => void
  onClose: () => void
}

export default function MacroEditorPanel({ macro, onSave, onClose }: MacroEditorPanelProps) {
  const [name, setName] = useState(macro.name)
  const [icon, setIcon] = useState(macro.icon)
  const [lines, setLines] = useState([
    macro.line1, macro.line2, macro.line3,
    macro.line4, macro.line5, macro.line6,
  ])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeLine, setActiveLine] = useState<number | null>(null)

  useEffect(() => {
    setName(macro.name)
    setIcon(macro.icon)
    setLines([macro.line1, macro.line2, macro.line3, macro.line4, macro.line5, macro.line6])
  }, [macro])

  const updateLine = (index: number, value: string) => {
    const newLines = [...lines]
    newLines[index] = value
    setLines(newLines)

    // Autocomplete
    if (value.startsWith('/')) {
      const prefix = value.split(' ')[0].toLowerCase()
      const matches = SLASH_COMMANDS.filter(c => c.startsWith(prefix) && c !== prefix)
      setSuggestions(matches.slice(0, 5))
      setActiveLine(index)
    } else {
      setSuggestions([])
      setActiveLine(null)
    }
  }

  const applySuggestion = (cmd: string) => {
    if (activeLine === null) return
    const newLines = [...lines]
    const rest = newLines[activeLine].includes(' ') ? newLines[activeLine].substring(newLines[activeLine].indexOf(' ')) : ' '
    newLines[activeLine] = cmd + rest
    setLines(newLines)
    setSuggestions([])
    setActiveLine(null)
  }

  const handleSave = () => {
    onSave({
      set: macro.set,
      position: macro.position,
      name,
      icon,
      line1: lines[0],
      line2: lines[1],
      line3: lines[2],
      line4: lines[3],
      line5: lines[4],
      line6: lines[5],
    })
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-200">
          {macro.set}+{macro.position}
        </h4>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">&times;</button>
      </div>

      {/* Name */}
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value.slice(0, 8))}
          maxLength={8}
          className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        />
        <div className="text-[10px] text-gray-600 mt-0.5">{name.length}/8</div>
      </div>

      {/* Icon */}
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Icon</label>
        <input
          type="number"
          min={0}
          max={255}
          value={icon}
          onChange={e => setIcon(Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
          className="w-20 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Lines */}
      <div className="space-y-1.5 mb-4">
        <label className="block text-xs text-gray-500">Commands</label>
        {lines.map((line, i) => (
          <div key={i} className="relative">
            <input
              value={line}
              onChange={e => updateLine(i, e.target.value.slice(0, 57))}
              maxLength={57}
              placeholder={`Line ${i + 1}`}
              className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
            {activeLine === i && suggestions.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-0.5 rounded border border-gray-700 bg-gray-800 shadow-lg">
                {suggestions.map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => applySuggestion(cmd)}
                    className="block w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 font-mono"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            )}
            <div className="text-[10px] text-gray-600 text-right">{line.length}/57</div>
          </div>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Save
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire editor into MacroEditorPage**

Add the import in `MacroEditorPage.tsx`:

```typescript
import MacroEditorPanel from '../components/macros/MacroEditorPanel'
```

Update the main content area to show the reel and editor side by side. Replace the `selectedBook` ternary content with:

```tsx
{selectedBook ? (
  <div className="flex gap-6">
    <MacroPageReel
      pages={selectedBook.pages}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      selectedMacro={selectedMacro}
      onMacroSelect={(set, position) => setSelectedMacro({ set, position })}
    />
    {selectedMacro && selectedBook && (() => {
      const page = selectedBook.pages.find(p => p.pageNumber === currentPage)
      const macro = page?.macros.find(m => m.set === selectedMacro.set && m.position === selectedMacro.position)
      if (!macro) return null
      return (
        <MacroEditorPanel
          macro={macro}
          onSave={async (updated) => {
            if (!id || !selectedBook) return
            const updatedPages = selectedBook.pages.map(p => ({
              pageNumber: p.pageNumber,
              macros: p.macros.map(m =>
                m.set === updated.set && m.position === updated.position && p.pageNumber === currentPage
                  ? updated
                  : m
              ),
            }))
            try {
              const result = await updateMacroBook(id, selectedBook.bookNumber, { pages: updatedPages })
              setSelectedBook(result)
              // Refresh book list to update pending status
              const updatedBooks = await listMacroBooks(id)
              setBooks(updatedBooks)
            } catch {
              setError('Failed to save macro')
            }
          }}
          onClose={() => setSelectedMacro(null)}
        />
      )
    })()}
  </div>
) : (
  <div className="text-gray-500 text-sm p-4">Select a macro book to view.</div>
)}
```

Add the `updateMacroBook` and `listMacroBooks` imports if not already present.

- [ ] **Step 3: Verify in browser**

Click a macro cell in the grid. The editor panel should appear on the right. Edit a macro name and lines, click Save. Confirm:
- The macro cell updates in the grid
- The book shows a yellow pending indicator
- No errors in the console

- [ ] **Step 4: Commit**

```
feat: add macro editor panel with save and autocomplete
```

---

### Task 11: Addon — DAT File Parser and Writer

**Files:**
- Create: `addon/vanalytics/macros.lua`

This module handles reading and writing FFXI macro DAT files. The DAT format stores one book per file (10 pages × 2 sets × 10 macros).

- [ ] **Step 1: Research the FFXI macro DAT format**

Before implementing, verify the binary format by examining an actual DAT file. The known structure is:

- Each macro entry: 4 bytes header, 8 bytes name (null-padded), 1 byte icon, 6 × 61 bytes for lines (null-padded)
- Each page: 20 macros (10 Ctrl + 10 Alt)
- Each book: 10 pages
- Total file size: 10 pages × 20 macros × (4 + 8 + 1 + 366) bytes = ~75,800 bytes

Use the addon's existing `dump` command or write a small test to read `mcr0.dat` and verify the byte layout matches. Adjust the parser if the format differs. The exact byte offsets may need empirical verification — use Windower's PacketViewer or a hex editor on a known macro file.

**Important:** The exact binary layout of FFXI macro DAT files should be verified against actual game files before finalizing this code. The structure below is based on community-documented formats but offsets may need adjustment.

- [ ] **Step 2: Create macros.lua module**

```lua
-- addon/vanalytics/macros.lua
-- FFXI Macro DAT file parser and writer

local macros = {}

-- Macro DAT format (per macro entry):
-- 4 bytes: header/padding
-- 8 bytes: macro name (null-padded)
-- 1 byte:  icon id
-- 6 x 61 bytes: command lines (null-padded)
-- Total per macro: 4 + 8 + 1 + 366 = 379 bytes
-- Per page: 20 macros (10 Ctrl + 10 Alt) = 7580 bytes
-- Per book (10 pages): 75800 bytes

local MACRO_SIZE = 379
local NAME_OFFSET = 4
local NAME_SIZE = 8
local ICON_OFFSET = 12
local LINE_SIZE = 61
local LINE_OFFSET = 13
local MACROS_PER_SET = 10
local SETS_PER_PAGE = 2
local MACROS_PER_PAGE = MACROS_PER_SET * SETS_PER_PAGE
local PAGES_PER_BOOK = 10

-- Read a null-terminated string from binary data
local function read_string(data, offset, maxlen)
    local s = data:sub(offset + 1, offset + maxlen)
    local null_pos = s:find('\0')
    if null_pos then
        s = s:sub(1, null_pos - 1)
    end
    return s
end

-- Pad a string to fixed length with null bytes
local function pad_string(s, len)
    if #s >= len then
        return s:sub(1, len)
    end
    return s .. string.rep('\0', len - #s)
end

-- Parse a single macro from binary data at the given byte offset
local function parse_macro(data, offset)
    local name = read_string(data, offset + NAME_OFFSET, NAME_SIZE)
    local icon = data:byte(offset + ICON_OFFSET + 1) or 0

    local lines = {}
    for i = 0, 5 do
        lines[i + 1] = read_string(data, offset + LINE_OFFSET + (i * LINE_SIZE), LINE_SIZE)
    end

    return {
        name = name,
        icon = icon,
        line1 = lines[1],
        line2 = lines[2],
        line3 = lines[3],
        line4 = lines[4],
        line5 = lines[5],
        line6 = lines[6],
    }
end

-- Write a single macro to binary data
local function write_macro(m)
    local header = '\0\0\0\0'
    local name = pad_string(m.name or '', NAME_SIZE)
    local icon = string.char(m.icon or 0)
    local lines = ''
    for i = 1, 6 do
        local key = 'line' .. i
        lines = lines .. pad_string(m[key] or '', LINE_SIZE)
    end
    return header .. name .. icon .. lines
end

-- Parse a full book DAT file into structured data
-- Returns: { pages = { [1..10] = { ctrl = {[1..10]}, alt = {[1..10]} } } }
function macros.parse_book(filepath)
    local f = io.open(filepath, 'rb')
    if not f then return nil end

    local data = f:read('*a')
    f:close()

    local book = { pages = {} }
    for page_idx = 0, PAGES_PER_BOOK - 1 do
        local page = { ctrl = {}, alt = {} }
        local page_offset = page_idx * MACROS_PER_PAGE * MACRO_SIZE

        -- First 10 macros = Ctrl, next 10 = Alt
        for i = 0, MACROS_PER_SET - 1 do
            local ctrl_offset = page_offset + (i * MACRO_SIZE)
            page.ctrl[i + 1] = parse_macro(data, ctrl_offset)
            page.ctrl[i + 1].set = 'Ctrl'
            page.ctrl[i + 1].position = i + 1

            local alt_offset = page_offset + ((MACROS_PER_SET + i) * MACRO_SIZE)
            page.alt[i + 1] = parse_macro(data, alt_offset)
            page.alt[i + 1].set = 'Alt'
            page.alt[i + 1].position = i + 1
        end

        book.pages[page_idx + 1] = page
    end

    return book
end

-- Write structured book data to a DAT file
function macros.write_book(filepath, book)
    local parts = {}

    for page_idx = 1, PAGES_PER_BOOK do
        local page = book.pages[page_idx]
        if not page then
            -- Write empty page
            for _ = 1, MACROS_PER_PAGE do
                table.insert(parts, write_macro({}))
            end
        else
            for i = 1, MACROS_PER_SET do
                table.insert(parts, write_macro(page.ctrl[i] or {}))
            end
            for i = 1, MACROS_PER_SET do
                table.insert(parts, write_macro(page.alt[i] or {}))
            end
        end
    end

    local f = io.open(filepath, 'wb')
    if not f then return false end
    f:write(table.concat(parts))
    f:close()
    return true
end

-- Convert parsed book data to the API JSON structure
function macros.book_to_api(book, book_number, content_hash)
    local api_book = {
        bookNumber = book_number,
        contentHash = content_hash,
        pages = {}
    }

    for page_idx = 1, PAGES_PER_BOOK do
        local page = book.pages[page_idx]
        local api_page = { pageNumber = page_idx, macros = {} }

        if page then
            for _, m in ipairs(page.ctrl) do
                table.insert(api_page.macros, {
                    set = 'Ctrl', position = m.position,
                    name = m.name, icon = m.icon,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
            for _, m in ipairs(page.alt) do
                table.insert(api_page.macros, {
                    set = 'Alt', position = m.position,
                    name = m.name, icon = m.icon,
                    line1 = m.line1, line2 = m.line2, line3 = m.line3,
                    line4 = m.line4, line5 = m.line5, line6 = m.line6,
                })
            end
        end

        table.insert(api_book.pages, api_page)
    end

    return api_book
end

-- Convert API JSON structure back to internal book format
function macros.api_to_book(api_book)
    local book = { pages = {} }

    for _, api_page in ipairs(api_book.pages) do
        local page = { ctrl = {}, alt = {} }

        -- Initialize empty
        for i = 1, MACROS_PER_SET do
            page.ctrl[i] = { set = 'Ctrl', position = i, name = '', icon = 0,
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            page.alt[i] = { set = 'Alt', position = i, name = '', icon = 0,
                line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
        end

        for _, m in ipairs(api_page.macros) do
            local target = m.set == 'Ctrl' and page.ctrl or page.alt
            target[m.position] = {
                set = m.set, position = m.position,
                name = m.name or '', icon = m.icon or 0,
                line1 = m.line1 or '', line2 = m.line2 or '',
                line3 = m.line3 or '', line4 = m.line4 or '',
                line5 = m.line5 or '', line6 = m.line6 or '',
            }
        end

        book.pages[api_page.pageNumber] = page
    end

    -- Fill any missing pages
    for i = 1, PAGES_PER_BOOK do
        if not book.pages[i] then
            book.pages[i] = { ctrl = {}, alt = {} }
            for j = 1, MACROS_PER_SET do
                book.pages[i].ctrl[j] = { set = 'Ctrl', position = j, name = '', icon = 0,
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
                book.pages[i].alt[j] = { set = 'Alt', position = j, name = '', icon = 0,
                    line1 = '', line2 = '', line3 = '', line4 = '', line5 = '', line6 = '' }
            end
        end
    end

    return book
end

-- Simple hash of file contents for change detection
function macros.hash_file(filepath)
    local f = io.open(filepath, 'rb')
    if not f then return nil end
    local data = f:read('*a')
    f:close()

    -- DJB2 hash
    local hash = 5381
    for i = 1, #data do
        hash = ((hash * 33) + data:byte(i)) % 0xFFFFFFFF
    end
    return string.format('%08x', hash)
end

return macros
```

- [ ] **Step 3: Commit**

```
feat: add macro DAT parser and writer module for Windower addon
```

---

### Task 12: Addon — Macro Sync Integration

**Files:**
- Modify: `addon/vanalytics/vanalytics.lua`

This integrates the macro sync into the existing addon sync loop and adds the new commands.

- [ ] **Step 1: Add macro module require and settings**

Near the top of `vanalytics.lua`, after existing requires, add:

```lua
local macro_lib = require('macros')
```

In the `defaults` table (settings defaults), add:

```lua
defaults.macro_hashes = {}
```

- [ ] **Step 2: Add macro sync to the sync loop**

Find the existing sync function (the one called by the prerender timer). After the character data sync and bazaar scan, add macro sync logic:

```lua
-- Macro sync (runs after character sync)
local function sync_macros(force)
    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    -- Build path to macro files
    -- FFXI stores macros in USER/<content_id>/mcr<0-19>.dat
    -- Content ID path needs to be discovered from the FFXI install directory
    local ffxi_path = windower.pol_path .. '\\USER'

    -- Find the character's macro directory
    -- The content ID folder name is typically a hex string
    -- We can find it by looking for the folder that was most recently modified
    -- or by reading it from Windower's internal state
    local macro_dir = nil
    local handle = io.popen('dir "' .. ffxi_path .. '" /b /ad /o-d 2>nul')
    if handle then
        macro_dir = handle:read('*l')
        handle:close()
    end

    if not macro_dir then
        log_error('Could not find macro directory')
        return
    end

    local macro_path = ffxi_path .. '\\' .. macro_dir

    local changed_books = {}
    for book_idx = 0, 19 do
        local dat_path = macro_path .. '\\mcr' .. book_idx .. '.dat'
        local hash = macro_lib.hash_file(dat_path)

        if hash then
            local stored_hash = settings.macro_hashes[tostring(book_idx)]
            if force or hash ~= stored_hash then
                local book = macro_lib.parse_book(dat_path)
                if book then
                    local api_book = macro_lib.book_to_api(book, book_idx + 1, hash)
                    table.insert(changed_books, api_book)
                    settings.macro_hashes[tostring(book_idx)] = hash
                end
            end
        end
    end

    if #changed_books > 0 then
        local payload = json_encode({ books = changed_books })
        local url = settings.api_url .. '/api/sync/macros'
        local resp_body, status = https_post(url, payload)

        if status == 200 then
            log_success('Synced ' .. #changed_books .. ' macro book(s)')
            settings:save()
        else
            log_error('Macro sync failed: ' .. tostring(status))
            -- Revert hashes so we retry next interval
            for _, book in ipairs(changed_books) do
                settings.macro_hashes[tostring(book.bookNumber - 1)] = nil
            end
        end
    end

    -- Check for pending pushes from web UI
    check_pending_macros(macro_path)
end

local function check_pending_macros(macro_path)
    local url = settings.api_url .. '/api/sync/macros/pending'
    local resp_body, status = https_get(url)

    if status ~= 200 or not resp_body then return end

    local resp = json_decode(resp_body)
    if not resp or not resp.pendingBooks or #resp.pendingBooks == 0 then return end

    local wrote_any = false
    for _, book_number in ipairs(resp.pendingBooks) do
        local book_url = settings.api_url .. '/api/sync/macros/' .. book_number
        local book_body, book_status = https_get(book_url)

        if book_status == 200 and book_body then
            local api_book = json_decode(book_body)
            if api_book then
                local book = macro_lib.api_to_book(api_book)
                local book_idx = book_number - 1
                local dat_path = macro_path .. '\\mcr' .. book_idx .. '.dat'

                if macro_lib.write_book(dat_path, book) then
                    -- Acknowledge receipt
                    local ack_url = settings.api_url .. '/api/sync/macros/pending/' .. book_number
                    https_delete(ack_url)

                    -- Update stored hash
                    settings.macro_hashes[tostring(book_idx)] = macro_lib.hash_file(dat_path)
                    wrote_any = true
                    log_success('Updated macro book ' .. book_number .. ' from web UI')
                end
            end
        end
    end

    if wrote_any then
        settings:save()
        windower.send_command('input /reloadmacros')
    end
end
```

Note: The `https_post`, `https_get`, `https_delete`, `json_encode`, `json_decode`, `log_success`, and `log_error` functions should already exist in the addon or need to be added following the existing HTTP utility patterns. `https_get` and `https_delete` follow the same pattern as the existing `https_post` function but with GET and DELETE methods respectively. Verify these exist and add them if not.

- [ ] **Step 3: Add macro commands**

In the addon command handler (the `windower.register_event('addon command', ...)` block), add cases for the new macro commands:

```lua
elseif cmd == 'macros' then
    local subcmd = args[1] and args[1]:lower() or 'status'

    if subcmd == 'push' then
        log_info('Force uploading all macro books...')
        sync_macros(true) -- force = true
    elseif subcmd == 'pull' then
        log_info('Checking for pending macro updates...')
        local ffxi_path = windower.pol_path .. '\\USER'
        local handle = io.popen('dir "' .. ffxi_path .. '" /b /ad /o-d 2>nul')
        local macro_dir = handle and handle:read('*l')
        if handle then handle:close() end
        if macro_dir then
            check_pending_macros(ffxi_path .. '\\' .. macro_dir)
        else
            log_error('Could not find macro directory')
        end
    elseif subcmd == 'status' then
        local tracked = 0
        for _ in pairs(settings.macro_hashes) do tracked = tracked + 1 end
        log_info('Macro books tracked: ' .. tracked .. '/20')
    else
        log_info('Macro commands: push | pull | status')
    end
```

- [ ] **Step 4: Call sync_macros from the main sync timer**

In the prerender timer callback, after the existing character sync call, add:

```lua
sync_macros(false)
```

- [ ] **Step 5: Commit**

```
feat: integrate macro sync into Windower addon with DAT read/write and push/pull commands
```

---

### Task 13: Schema Test

**Files:**
- Modify: `tests/Vanalytics.Data.Tests/SchemaTests.cs`

- [ ] **Step 1: Add macro schema test**

Add a test to verify the full macro entity graph can be inserted and retrieved:

```csharp
[Fact]
public async Task CanInsertAndRetrieveMacroBookGraph()
{
    var user = new User
    {
        Id = Guid.NewGuid(),
        Email = "macrotest@test.com",
        Username = "macrouser",
        PasswordHash = "hash",
        Role = UserRole.User,
        IsEnabled = true,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    _db.Users.Add(user);

    var character = new Character
    {
        Id = Guid.NewGuid(),
        UserId = user.Id,
        Name = "MacroTestChar",
        Server = "Asura",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    _db.Characters.Add(character);

    var book = new MacroBook
    {
        Id = Guid.NewGuid(),
        CharacterId = character.Id,
        BookNumber = 1,
        ContentHash = "testhash",
        PendingPush = false,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    _db.MacroBooks.Add(book);

    var page = new MacroPage
    {
        Id = Guid.NewGuid(),
        MacroBookId = book.Id,
        PageNumber = 1
    };
    _db.MacroPages.Add(page);

    _db.Macros.Add(new Macro
    {
        Id = Guid.NewGuid(),
        MacroPageId = page.Id,
        Set = "Ctrl",
        Position = 1,
        Name = "Cure IV",
        Icon = 5,
        Line1 = "/ma \"Cure IV\" <stpt>",
        Line2 = "",
        Line3 = "",
        Line4 = "",
        Line5 = "",
        Line6 = ""
    });

    await _db.SaveChangesAsync();

    var loaded = await _db.MacroBooks
        .Include(b => b.Pages).ThenInclude(p => p.Macros)
        .FirstAsync(b => b.Id == book.Id);

    Assert.Equal(1, loaded.BookNumber);
    Assert.Single(loaded.Pages);
    Assert.Single(loaded.Pages[0].Macros);
    Assert.Equal("Cure IV", loaded.Pages[0].Macros[0].Name);
}

[Fact]
public async Task EnforcesUniqueMacroBookPerCharacter()
{
    var user = new User
    {
        Id = Guid.NewGuid(),
        Email = "macrodupe@test.com",
        Username = "macrodupeuser",
        PasswordHash = "hash",
        Role = UserRole.User,
        IsEnabled = true,
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    _db.Users.Add(user);

    var character = new Character
    {
        Id = Guid.NewGuid(),
        UserId = user.Id,
        Name = "DupeMacroChar",
        Server = "Asura",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    _db.Characters.Add(character);

    _db.MacroBooks.Add(new MacroBook
    {
        Id = Guid.NewGuid(),
        CharacterId = character.Id,
        BookNumber = 1,
        ContentHash = "hash1",
        UpdatedAt = DateTimeOffset.UtcNow
    });
    await _db.SaveChangesAsync();

    _db.MacroBooks.Add(new MacroBook
    {
        Id = Guid.NewGuid(),
        CharacterId = character.Id,
        BookNumber = 1,
        ContentHash = "hash2",
        UpdatedAt = DateTimeOffset.UtcNow
    });
    await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
}
```

Add the necessary usings at the top of the test file:
```csharp
using Vanalytics.Core.Models;
```

- [ ] **Step 2: Run schema tests**

```bash
cd tests/Vanalytics.Data.Tests && dotnet test -v n
```

Expected: All tests pass including the new macro tests.

- [ ] **Step 3: Commit**

```
test: add macro entity schema tests
```

---

### Task 14: Final Integration Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd tests && dotnet test -v n
```

Expected: All tests pass.

- [ ] **Step 2: Build the full Docker stack**

```bash
cd /path/to/Vanalytics && docker compose up --build
```

Expected: Both API and web containers build and start successfully. The migration runs automatically on startup.

- [ ] **Step 3: Verify the API endpoints via Scalar**

Open `http://localhost:5000/api/docs/` and verify:
- `POST /api/sync/macros` appears under the sync group
- `GET /api/sync/macros/pending` appears
- `GET /api/sync/macros/{bookNumber}` appears
- `DELETE /api/sync/macros/pending/{bookNumber}` appears
- `GET /api/macros/{characterId}` appears
- `GET /api/macros/{characterId}/{bookNumber}` appears
- `PUT /api/macros/{characterId}/{bookNumber}` appears

- [ ] **Step 4: Verify the frontend macro editor page**

Navigate to a character's macro page at `http://localhost:3000/characters/{id}/macros`. Confirm:
- Empty state message shows if no macros synced
- Once macro data exists (via API call), book selector renders
- Selecting a book loads the page reel
- Clicking a macro opens the editor panel

- [ ] **Step 5: Commit**

```
feat: macro builder — complete integration
```
