# Session Tracker & Inventory Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based performance tracking (combat + economy) and inventory collection to the Vanalytics Windower addon, API, and frontend.

**Architecture:** Two addon modules (`session.lua`, `inventory.lua`) capture data and upload via new API-key-authed endpoints. Four new EF Core entities store session events and inventory state. Frontend gets a sessions dashboard and an inventory tab on the character detail page.

**Tech Stack:** Lua (Windower addon), C# / ASP.NET Core / EF Core (API), React / TypeScript / Tailwind (frontend), xUnit + Testcontainers (tests)

**Spec:** `docs/superpowers/specs/2026-03-25-session-tracker-inventory-collector-design.md`

---

## File Map

### Backend — New Files
- `src/Vanalytics.Core/Enums/SessionStatus.cs` — Session lifecycle enum
- `src/Vanalytics.Core/Enums/SessionEventType.cs` — Event type enum
- `src/Vanalytics.Core/Enums/InventoryBag.cs` — Bag type enum
- `src/Vanalytics.Core/Enums/InventoryChangeType.cs` — Change type enum
- `src/Vanalytics.Core/Models/Session.cs` — Session entity
- `src/Vanalytics.Core/Models/SessionEvent.cs` — Session event entity
- `src/Vanalytics.Core/Models/CharacterInventory.cs` — Current inventory state entity
- `src/Vanalytics.Core/Models/InventoryChange.cs` — Inventory change history entity
- `src/Vanalytics.Core/DTOs/Session/SessionStartRequest.cs` — Start session request DTO
- `src/Vanalytics.Core/DTOs/Session/SessionStopRequest.cs` — Stop session request DTO
- `src/Vanalytics.Core/DTOs/Session/SessionEventsRequest.cs` — Batch events request DTO
- `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs` — Session list/detail response DTOs
- `src/Vanalytics.Core/DTOs/Sync/InventorySyncRequest.cs` — Inventory diff request DTO
- `src/Vanalytics.Data/Configurations/SessionConfiguration.cs` — Session EF config
- `src/Vanalytics.Data/Configurations/SessionEventConfiguration.cs` — SessionEvent EF config
- `src/Vanalytics.Data/Configurations/CharacterInventoryConfiguration.cs` — Inventory EF config
- `src/Vanalytics.Data/Configurations/InventoryChangeConfiguration.cs` — Change history EF config
- `src/Vanalytics.Api/Services/SessionRateLimiter.cs` — 300/hr rate limiter
- `src/Vanalytics.Api/Controllers/SessionController.cs` — Addon session endpoints (API key auth)
- `src/Vanalytics.Api/Controllers/SessionsController.cs` — Frontend session endpoints (JWT auth)
- `src/Vanalytics.Api/Controllers/InventoryController.cs` — Addon inventory sync endpoint (API key auth)
- `tests/Vanalytics.Api.Tests/Controllers/SessionControllerTests.cs` — Session addon endpoint tests
- `tests/Vanalytics.Api.Tests/Controllers/SessionsControllerTests.cs` — Session frontend endpoint tests
- `tests/Vanalytics.Api.Tests/Controllers/InventoryControllerTests.cs` — Inventory endpoint tests

### Backend — Modified Files
- `src/Vanalytics.Data/VanalyticsDbContext.cs` — Add 4 new DbSets
- `src/Vanalytics.Api/Program.cs` — Register SessionRateLimiter
- `src/Vanalytics.Api/Controllers/CharactersController.cs` — Add inventory endpoint

### Frontend — New Files
- `src/Vanalytics.Web/src/pages/SessionsPage.tsx` — Sessions list page
- `src/Vanalytics.Web/src/pages/SessionDetailPage.tsx` — Session detail with tabs
- `src/Vanalytics.Web/src/components/character/InventoryTab.tsx` — Inventory tab component

### Frontend — Modified Files
- `src/Vanalytics.Web/src/types/api.ts` — Add session + inventory types
- `src/Vanalytics.Web/src/App.tsx` — Add session routes
- `src/Vanalytics.Web/src/components/Layout.tsx` — Add Sessions sidebar link
- `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx` — Add Inventory tab

### Addon — New Files
- `addon/vanalytics/session.lua` — Session lifecycle, chat log parser, file writer, upload
- `addon/vanalytics/inventory.lua` — Inventory snapshot, diff, upload

### Addon — Modified Files
- `addon/vanalytics/vanalytics.lua` — Require new modules, add session/inventory commands, hook into sync timer

---

## Task 1: Backend Enums

**Files:**
- Create: `src/Vanalytics.Core/Enums/SessionStatus.cs`
- Create: `src/Vanalytics.Core/Enums/SessionEventType.cs`
- Create: `src/Vanalytics.Core/Enums/InventoryBag.cs`
- Create: `src/Vanalytics.Core/Enums/InventoryChangeType.cs`

- [ ] **Step 1: Create SessionStatus enum**

```csharp
// src/Vanalytics.Core/Enums/SessionStatus.cs
namespace Vanalytics.Core.Enums;

public enum SessionStatus
{
    Active,
    Completed,
    Abandoned
}
```

- [ ] **Step 2: Create SessionEventType enum**

```csharp
// src/Vanalytics.Core/Enums/SessionEventType.cs
namespace Vanalytics.Core.Enums;

public enum SessionEventType
{
    MeleeDamage,
    RangedDamage,
    SpellDamage,
    AbilityDamage,
    DamageReceived,
    Healing,
    ItemDrop,
    GilGain,
    GilLoss,
    MobKill,
    Skillchain,
    MagicBurst,
    ExpGain,
    LimitGain,
    CapacityGain
}
```

- [ ] **Step 3: Create InventoryBag enum**

```csharp
// src/Vanalytics.Core/Enums/InventoryBag.cs
namespace Vanalytics.Core.Enums;

public enum InventoryBag
{
    Inventory,
    Safe,
    Storage,
    Locker,
    Satchel,
    Sack,
    Case,
    Wardrobe,
    Wardrobe2,
    Wardrobe3,
    Wardrobe4,
    Wardrobe5,
    Wardrobe6,
    Wardrobe7,
    Wardrobe8
}
```

- [ ] **Step 4: Create InventoryChangeType enum**

```csharp
// src/Vanalytics.Core/Enums/InventoryChangeType.cs
namespace Vanalytics.Core.Enums;

public enum InventoryChangeType
{
    Added,
    Removed,
    QuantityChanged
}
```

- [ ] **Step 5: Verify build**

Run: `dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Core/Enums/SessionStatus.cs src/Vanalytics.Core/Enums/SessionEventType.cs src/Vanalytics.Core/Enums/InventoryBag.cs src/Vanalytics.Core/Enums/InventoryChangeType.cs
git commit -m "feat: add enums for session tracking and inventory collection"
```

---

## Task 2: Backend Entity Models

**Files:**
- Create: `src/Vanalytics.Core/Models/Session.cs`
- Create: `src/Vanalytics.Core/Models/SessionEvent.cs`
- Create: `src/Vanalytics.Core/Models/CharacterInventory.cs`
- Create: `src/Vanalytics.Core/Models/InventoryChange.cs`

- [ ] **Step 1: Create Session model**

```csharp
// src/Vanalytics.Core/Models/Session.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class Session
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public string Zone { get; set; } = string.Empty;
    public SessionStatus Status { get; set; }

    public Character Character { get; set; } = null!;
    public List<SessionEvent> Events { get; set; } = [];
}
```

- [ ] **Step 2: Create SessionEvent model**

```csharp
// src/Vanalytics.Core/Models/SessionEvent.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class SessionEvent
{
    public long Id { get; set; }
    public Guid SessionId { get; set; }
    public SessionEventType EventType { get; set; }
    public DateTimeOffset Timestamp { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public long Value { get; set; }
    public string? Ability { get; set; }
    public int? ItemId { get; set; }
    public string Zone { get; set; } = string.Empty;

    public Session Session { get; set; } = null!;
}
```

- [ ] **Step 3: Create CharacterInventory model**

```csharp
// src/Vanalytics.Core/Models/CharacterInventory.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CharacterInventory
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag Bag { get; set; }
    public int SlotIndex { get; set; }
    public int Quantity { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 4: Create InventoryChange model**

```csharp
// src/Vanalytics.Core/Models/InventoryChange.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class InventoryChange
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag Bag { get; set; }
    public int SlotIndex { get; set; }
    public InventoryChangeType ChangeType { get; set; }
    public int QuantityBefore { get; set; }
    public int QuantityAfter { get; set; }
    public DateTimeOffset ChangedAt { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 5: Verify build**

Run: `dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj`
Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Core/Models/Session.cs src/Vanalytics.Core/Models/SessionEvent.cs src/Vanalytics.Core/Models/CharacterInventory.cs src/Vanalytics.Core/Models/InventoryChange.cs
git commit -m "feat: add entity models for sessions and inventory"
```

---

## Task 3: EF Core Configurations and DbContext

**Files:**
- Create: `src/Vanalytics.Data/Configurations/SessionConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/SessionEventConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/CharacterInventoryConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/InventoryChangeConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create SessionConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/SessionConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        builder.HasKey(s => s.Id);

        builder.HasIndex(s => new { s.CharacterId, s.Status });
        builder.HasIndex(s => new { s.CharacterId, s.StartedAt });

        builder.Property(s => s.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Character)
            .WithMany()
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 2: Create SessionEventConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/SessionEventConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SessionEventConfiguration : IEntityTypeConfiguration<SessionEvent>
{
    public void Configure(EntityTypeBuilder<SessionEvent> builder)
    {
        builder.HasKey(e => e.Id);

        builder.HasIndex(e => new { e.SessionId, e.EventType });
        builder.HasIndex(e => new { e.SessionId, e.Timestamp });

        builder.Property(e => e.Source).HasMaxLength(64).IsRequired();
        builder.Property(e => e.Target).HasMaxLength(128).IsRequired();
        builder.Property(e => e.Ability).HasMaxLength(128);
        builder.Property(e => e.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(e => e.Session)
            .WithMany(s => s.Events)
            .HasForeignKey(e => e.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 3: Create CharacterInventoryConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/CharacterInventoryConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterInventoryConfiguration : IEntityTypeConfiguration<CharacterInventory>
{
    public void Configure(EntityTypeBuilder<CharacterInventory> builder)
    {
        builder.HasKey(i => i.Id);

        builder.HasIndex(i => new { i.CharacterId, i.ItemId, i.Bag, i.SlotIndex }).IsUnique();

        builder.HasOne(i => i.Character)
            .WithMany()
            .HasForeignKey(i => i.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 4: Create InventoryChangeConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/InventoryChangeConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class InventoryChangeConfiguration : IEntityTypeConfiguration<InventoryChange>
{
    public void Configure(EntityTypeBuilder<InventoryChange> builder)
    {
        builder.HasKey(c => c.Id);

        builder.HasIndex(c => new { c.CharacterId, c.ChangedAt });

        builder.HasOne(c => c.Character)
            .WithMany()
            .HasForeignKey(c => c.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 5: Add DbSets to VanalyticsDbContext**

Add these 4 lines after the existing `DbSet<Zone> Zones` line in `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<SessionEvent> SessionEvents => Set<SessionEvent>();
    public DbSet<CharacterInventory> CharacterInventories => Set<CharacterInventory>();
    public DbSet<InventoryChange> InventoryChanges => Set<InventoryChange>();
```

Also add `using Vanalytics.Core.Models;` if not already present (it is).

- [ ] **Step 6: Create EF Core migration**

Run from the `Vanalytics` directory:
```bash
dotnet ef migrations add AddSessionsAndInventory --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
```
Expected: Migration files created in `src/Vanalytics.Data/Migrations/`

- [ ] **Step 7: Verify build**

Run: `dotnet build Vanalytics.sln`
Expected: Build succeeded

- [ ] **Step 8: Commit**

```bash
git add src/Vanalytics.Data/
git commit -m "feat: add EF Core configurations and migration for sessions and inventory"
```

---

## Task 4: DTOs

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Session/SessionStartRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Session/SessionStopRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Session/SessionEventsRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Session/SessionResponse.cs`
- Create: `src/Vanalytics.Core/DTOs/Sync/InventorySyncRequest.cs`

- [ ] **Step 1: Create session request DTOs**

```csharp
// src/Vanalytics.Core/DTOs/Session/SessionStartRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

public class SessionStartRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Zone { get; set; } = string.Empty;
}
```

```csharp
// src/Vanalytics.Core/DTOs/Session/SessionStopRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

public class SessionStopRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;
}
```

```csharp
// src/Vanalytics.Core/DTOs/Session/SessionEventsRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

public class SessionEventsRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<SessionEventEntry> Events { get; set; } = []; // Max 500 enforced in controller
}

public class SessionEventEntry
{
    [Required]
    public string EventType { get; set; } = string.Empty;

    public DateTimeOffset Timestamp { get; set; }

    [MaxLength(64)]
    public string Source { get; set; } = string.Empty;

    [MaxLength(128)]
    public string Target { get; set; } = string.Empty;

    public long Value { get; set; }

    [MaxLength(128)]
    public string? Ability { get; set; }

    public int? ItemId { get; set; }

    [MaxLength(64)]
    public string Zone { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create session response DTOs**

```csharp
// src/Vanalytics.Core/DTOs/Session/SessionResponse.cs
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.DTOs.Session;

public class SessionSummaryResponse
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string Zone { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public SessionStatus Status { get; set; }
    public long TotalDamage { get; set; }
    public long GilEarned { get; set; }
    public int MobsKilled { get; set; }
    public int ItemsDropped { get; set; }
}

public class SessionDetailResponse : SessionSummaryResponse
{
    public double DpsAverage { get; set; }
    public double GilPerHour { get; set; }
    public long ExpGained { get; set; }
    public long HealingDone { get; set; }
    public int EventCount { get; set; }
}

public class SessionEventResponse
{
    public long Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public long Value { get; set; }
    public string? Ability { get; set; }
    public int? ItemId { get; set; }
    public string Zone { get; set; } = string.Empty;
}

public class SessionTimelineEntry
{
    public DateTimeOffset Timestamp { get; set; }
    public long Damage { get; set; }
    public long Healing { get; set; }
    public long Gil { get; set; }
    public int Kills { get; set; }
}
```

- [ ] **Step 3: Create inventory sync DTO**

```csharp
// src/Vanalytics.Core/DTOs/Sync/InventorySyncRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class InventorySyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<InventoryChangeEntry> Changes { get; set; } = [];
}

public class InventoryChangeEntry
{
    public int ItemId { get; set; }

    [Required]
    public string Bag { get; set; } = string.Empty;

    public int SlotIndex { get; set; }

    [Required]
    public string ChangeType { get; set; } = string.Empty;

    public int QuantityBefore { get; set; }
    public int QuantityAfter { get; set; }
}
```

- [ ] **Step 4: Verify build**

Run: `dotnet build src/Vanalytics.Core/Vanalytics.Core.csproj`
Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Core/DTOs/Session/ src/Vanalytics.Core/DTOs/Sync/InventorySyncRequest.cs
git commit -m "feat: add DTOs for session tracking and inventory sync"
```

---

## Task 5: SessionRateLimiter + Program.cs Registration

**Files:**
- Create: `src/Vanalytics.Api/Services/SessionRateLimiter.cs`
- Modify: `src/Vanalytics.Api/Program.cs:82`

- [ ] **Step 1: Create SessionRateLimiter**

```csharp
// src/Vanalytics.Api/Services/SessionRateLimiter.cs
namespace Vanalytics.Api.Services;

public class SessionRateLimiter : RateLimiter
{
    public SessionRateLimiter() : base(maxRequests: 300, window: TimeSpan.FromHours(1))
    {
    }
}
```

- [ ] **Step 2: Register in Program.cs**

In `src/Vanalytics.Api/Program.cs`, add after line 83 (`builder.Services.AddSingleton<LoginRateLimiter>();`):

```csharp
builder.Services.AddSingleton<SessionRateLimiter>();
```

- [ ] **Step 3: Verify build**

Run: `dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Api/Services/SessionRateLimiter.cs src/Vanalytics.Api/Program.cs
git commit -m "feat: add SessionRateLimiter at 300 req/hr"
```

---

## Task 6: SessionController (Addon API Key Endpoints)

**Files:**
- Create: `src/Vanalytics.Api/Controllers/SessionController.cs`
- Test: `tests/Vanalytics.Api.Tests/Controllers/SessionControllerTests.cs`

- [ ] **Step 1: Write tests for session start/stop/events**

Create `tests/Vanalytics.Api.Tests/Controllers/SessionControllerTests.cs`. Tests should cover:
- `POST /api/session/start` — creates session, returns sessionId
- `POST /api/session/start` — abandons existing active session and creates new one
- `POST /api/session/start` — returns 401 without API key
- `POST /api/session/stop` — marks session as Completed
- `POST /api/session/stop` — returns 404 if no active session
- `POST /api/session/events` — accepts batch of events, writes to DB
- `POST /api/session/events` — returns 400 if no active session
- `POST /api/session/events` — rejects batch > 500 events

Follow the existing test pattern from `tests/Vanalytics.Api.Tests/Controllers/KeysControllerTests.cs` — use `WebApplicationFactory<Program>`, `MsSqlContainer`, seed test data, generate API key via helper method.

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "SessionController" -v n`
Expected: All tests FAIL (controller doesn't exist yet)

- [ ] **Step 3: Implement SessionController**

```csharp
// src/Vanalytics.Api/Controllers/SessionController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Session;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/session")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class SessionController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly SessionRateLimiter _rateLimiter;

    public SessionController(VanalyticsDbContext db, SessionRateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] SessionStartRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 300 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found. Sync character data first." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Abandon any existing active session for this character
        var activeSession = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (activeSession is not null)
        {
            activeSession.Status = SessionStatus.Abandoned;
            activeSession.EndedAt = DateTimeOffset.UtcNow;
        }

        var session = new Session
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            StartedAt = DateTimeOffset.UtcNow,
            Zone = request.Zone,
            Status = SessionStatus.Active
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new { sessionId = session.Id, message = "Session started" });
    }

    [HttpPost("stop")]
    public async Task<IActionResult> Stop([FromBody] SessionStopRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var session = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (session is null)
            return NotFound(new { message = "No active session found." });

        session.Status = SessionStatus.Completed;
        session.EndedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Session stopped", sessionId = session.Id });
    }

    [HttpPost("events")]
    public async Task<IActionResult> Events([FromBody] SessionEventsRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded." });

        if (request.Events.Count > 500)
            return BadRequest(new { message = "Maximum 500 events per batch." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var session = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (session is null)
            return BadRequest(new { message = "No active session. Start a session first." });

        var events = new List<SessionEvent>();
        foreach (var entry in request.Events)
        {
            if (!Enum.TryParse<SessionEventType>(entry.EventType, true, out var eventType))
                continue;

            events.Add(new SessionEvent
            {
                SessionId = session.Id,
                EventType = eventType,
                Timestamp = entry.Timestamp,
                Source = entry.Source,
                Target = entry.Target,
                Value = entry.Value,
                Ability = entry.Ability,
                ItemId = entry.ItemId,
                Zone = entry.Zone
            });
        }

        _db.SessionEvents.AddRange(events);
        await _db.SaveChangesAsync();

        return Ok(new { accepted = events.Count, total = request.Events.Count });
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "SessionController" -v n`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Api/Controllers/SessionController.cs tests/Vanalytics.Api.Tests/Controllers/SessionControllerTests.cs
git commit -m "feat: add SessionController with start/stop/events endpoints"
```

---

## Task 7: InventoryController (Addon API Key Endpoint)

**Files:**
- Create: `src/Vanalytics.Api/Controllers/InventoryController.cs`
- Test: `tests/Vanalytics.Api.Tests/Controllers/InventoryControllerTests.cs`

- [ ] **Step 1: Write tests**

Tests should cover:
- `POST /api/sync/inventory` — accepts changes, creates CharacterInventory rows and InventoryChange history
- Handles Added, Removed, QuantityChanged change types
- Upserts on `(CharacterId, ItemId, Bag, SlotIndex)` — sending same item twice updates instead of duplicating
- Removed changes delete the CharacterInventory row
- Returns 401 without API key
- Returns 403 for unowned character
- Rate limited at 20/hr (shares the existing `RateLimiter` singleton with `SyncController` — both endpoints share the 20/hr budget per API key)

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "InventoryController" -v n`
Expected: All tests FAIL

- [ ] **Step 3: Implement InventoryController**

```csharp
// src/Vanalytics.Api/Controllers/InventoryController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync/inventory")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class InventoryController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public InventoryController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncInventory([FromBody] InventorySyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found. Sync character data first." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var now = DateTimeOffset.UtcNow;
        int processed = 0;

        foreach (var change in request.Changes)
        {
            if (!Enum.TryParse<InventoryBag>(change.Bag, true, out var bag)) continue;
            if (!Enum.TryParse<InventoryChangeType>(change.ChangeType, true, out var changeType)) continue;

            // Record the change in history
            _db.InventoryChanges.Add(new InventoryChange
            {
                CharacterId = character.Id,
                ItemId = change.ItemId,
                Bag = bag,
                SlotIndex = change.SlotIndex,
                ChangeType = changeType,
                QuantityBefore = change.QuantityBefore,
                QuantityAfter = change.QuantityAfter,
                ChangedAt = now
            });

            // Update current inventory state
            var existing = await _db.CharacterInventories
                .FirstOrDefaultAsync(i =>
                    i.CharacterId == character.Id &&
                    i.ItemId == change.ItemId &&
                    i.Bag == bag &&
                    i.SlotIndex == change.SlotIndex);

            switch (changeType)
            {
                case InventoryChangeType.Added:
                    if (existing is null)
                    {
                        _db.CharacterInventories.Add(new CharacterInventory
                        {
                            CharacterId = character.Id,
                            ItemId = change.ItemId,
                            Bag = bag,
                            SlotIndex = change.SlotIndex,
                            Quantity = change.QuantityAfter,
                            LastSeenAt = now
                        });
                    }
                    else
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = now;
                    }
                    break;

                case InventoryChangeType.QuantityChanged:
                    if (existing is not null)
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = now;
                    }
                    break;

                case InventoryChangeType.Removed:
                    if (existing is not null)
                        _db.CharacterInventories.Remove(existing);
                    break;
            }

            processed++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { message = "Inventory synced", processed });
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "InventoryController" -v n`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Api/Controllers/InventoryController.cs tests/Vanalytics.Api.Tests/Controllers/InventoryControllerTests.cs
git commit -m "feat: add InventoryController for addon inventory sync"
```

---

## Task 8: SessionsController (Frontend JWT Endpoints)

**Files:**
- Create: `src/Vanalytics.Api/Controllers/SessionsController.cs`
- Modify: `src/Vanalytics.Api/Controllers/CharactersController.cs`
- Test: `tests/Vanalytics.Api.Tests/Controllers/SessionsControllerTests.cs`

- [ ] **Step 1: Write tests**

Tests should cover:
- `GET /api/sessions` — returns paginated list of user's sessions
- `GET /api/sessions/{id}` — returns session detail with aggregated stats
- `GET /api/sessions/{id}/events` — returns paginated events, filterable by type
- `GET /api/sessions/{id}/timeline` — returns time-bucketed aggregations
- `DELETE /api/sessions/{id}` — deletes session and events
- `GET /api/characters/{id}/inventory` — returns inventory grouped by bag
- All endpoints return 401 without JWT
- Cannot access another user's sessions

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "SessionsController" -v n`
Expected: All tests FAIL

- [ ] **Step 3: Implement SessionsController**

```csharp
// src/Vanalytics.Api/Controllers/SessionsController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Session;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sessions")]
[Authorize]
public class SessionsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public SessionsController(VanalyticsDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? characterId,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var query = _db.Sessions
            .Include(s => s.Character)
            .Where(s => s.Character.UserId == userId);

        if (characterId.HasValue)
            query = query.Where(s => s.CharacterId == characterId.Value);
        if (from.HasValue)
            query = query.Where(s => s.StartedAt >= from.Value);
        if (to.HasValue)
            query = query.Where(s => s.StartedAt <= to.Value);

        var totalCount = await query.CountAsync();

        var sessions = await query
            .OrderByDescending(s => s.StartedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SessionSummaryResponse
            {
                Id = s.Id,
                CharacterId = s.CharacterId,
                CharacterName = s.Character.Name,
                Server = s.Character.Server,
                Zone = s.Zone,
                StartedAt = s.StartedAt,
                EndedAt = s.EndedAt,
                Status = s.Status,
                TotalDamage = s.Events
                    .Where(e => e.EventType == SessionEventType.MeleeDamage
                        || e.EventType == SessionEventType.RangedDamage
                        || e.EventType == SessionEventType.SpellDamage
                        || e.EventType == SessionEventType.AbilityDamage)
                    .Sum(e => e.Value),
                GilEarned = s.Events
                    .Where(e => e.EventType == SessionEventType.GilGain)
                    .Sum(e => e.Value),
                MobsKilled = s.Events.Count(e => e.EventType == SessionEventType.MobKill),
                ItemsDropped = s.Events.Count(e => e.EventType == SessionEventType.ItemDrop)
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, sessions });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var session = await _db.Sessions
            .Include(s => s.Character)
            .FirstOrDefaultAsync(s => s.Id == id && s.Character.UserId == userId);

        if (session is null)
            return NotFound(new { message = "Session not found." });

        // Aggregate at database level to avoid loading all events into memory
        var damageTypes = new[]
        {
            SessionEventType.MeleeDamage, SessionEventType.RangedDamage,
            SessionEventType.SpellDamage, SessionEventType.AbilityDamage
        };

        var eventsQuery = _db.SessionEvents.Where(e => e.SessionId == id);

        var totalDamage = await eventsQuery
            .Where(e => damageTypes.Contains(e.EventType))
            .SumAsync(e => e.Value);
        var gilEarned = await eventsQuery
            .Where(e => e.EventType == SessionEventType.GilGain)
            .SumAsync(e => e.Value);
        var mobsKilled = await eventsQuery.CountAsync(e => e.EventType == SessionEventType.MobKill);
        var itemsDropped = await eventsQuery.CountAsync(e => e.EventType == SessionEventType.ItemDrop);
        var expGained = await eventsQuery
            .Where(e => e.EventType == SessionEventType.ExpGain)
            .SumAsync(e => e.Value);
        var healingDone = await eventsQuery
            .Where(e => e.EventType == SessionEventType.Healing)
            .SumAsync(e => e.Value);
        var eventCount = await eventsQuery.CountAsync();

        var duration = (session.EndedAt ?? DateTimeOffset.UtcNow) - session.StartedAt;
        var dpsAverage = duration.TotalSeconds > 0 ? totalDamage / duration.TotalSeconds : 0;
        var gilPerHour = duration.TotalHours > 0 ? gilEarned / duration.TotalHours : 0;

        return Ok(new SessionDetailResponse
        {
            Id = session.Id,
            CharacterId = session.CharacterId,
            CharacterName = session.Character.Name,
            Server = session.Character.Server,
            Zone = session.Zone,
            StartedAt = session.StartedAt,
            EndedAt = session.EndedAt,
            Status = session.Status,
            TotalDamage = totalDamage,
            DpsAverage = Math.Round(dpsAverage, 2),
            GilEarned = gilEarned,
            GilPerHour = Math.Round(gilPerHour, 2),
            MobsKilled = mobsKilled,
            ItemsDropped = itemsDropped,
            ExpGained = expGained,
            HealingDone = healingDone,
            EventCount = eventCount
        });
    }

    [HttpGet("{id:guid}/events")]
    public async Task<IActionResult> Events(
        Guid id,
        [FromQuery] string? eventType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var session = await _db.Sessions
            .Include(s => s.Character)
            .FirstOrDefaultAsync(s => s.Id == id && s.Character.UserId == userId);

        if (session is null)
            return NotFound(new { message = "Session not found." });

        var query = _db.SessionEvents.Where(e => e.SessionId == id);

        if (!string.IsNullOrEmpty(eventType) && Enum.TryParse<SessionEventType>(eventType, true, out var type))
            query = query.Where(e => e.EventType == type);

        var totalCount = await query.CountAsync();

        var events = await query
            .OrderBy(e => e.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new SessionEventResponse
            {
                Id = e.Id,
                EventType = e.EventType.ToString(),
                Timestamp = e.Timestamp,
                Source = e.Source,
                Target = e.Target,
                Value = e.Value,
                Ability = e.Ability,
                ItemId = e.ItemId,
                Zone = e.Zone
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, events });
    }

    [HttpGet("{id:guid}/timeline")]
    public async Task<IActionResult> Timeline(Guid id, [FromQuery] int bucketMinutes = 1)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var session = await _db.Sessions
            .Include(s => s.Character)
            .FirstOrDefaultAsync(s => s.Id == id && s.Character.UserId == userId);

        if (session is null)
            return NotFound(new { message = "Session not found." });

        // Note: This loads all events into memory for client-side grouping.
        // For very long sessions (10K+ events), consider database-level bucketing
        // or a dedicated materialized view. Acceptable for initial implementation.
        var events = await _db.SessionEvents
            .Where(e => e.SessionId == id)
            .OrderBy(e => e.Timestamp)
            .ToListAsync();

        var damageTypes = new HashSet<SessionEventType>
        {
            SessionEventType.MeleeDamage, SessionEventType.RangedDamage,
            SessionEventType.SpellDamage, SessionEventType.AbilityDamage
        };

        var bucketSpan = TimeSpan.FromMinutes(bucketMinutes);
        var timeline = events
            .GroupBy(e => new DateTimeOffset(
                session.StartedAt.Ticks + (e.Timestamp.Ticks - session.StartedAt.Ticks) / bucketSpan.Ticks * bucketSpan.Ticks,
                e.Timestamp.Offset))
            .Select(g => new SessionTimelineEntry
            {
                Timestamp = g.Key,
                Damage = g.Where(e => damageTypes.Contains(e.EventType)).Sum(e => e.Value),
                Healing = g.Where(e => e.EventType == SessionEventType.Healing).Sum(e => e.Value),
                Gil = g.Where(e => e.EventType == SessionEventType.GilGain).Sum(e => e.Value)
                    - g.Where(e => e.EventType == SessionEventType.GilLoss).Sum(e => e.Value),
                Kills = g.Count(e => e.EventType == SessionEventType.MobKill)
            })
            .OrderBy(t => t.Timestamp)
            .ToList();

        return Ok(timeline);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var session = await _db.Sessions
            .Include(s => s.Character)
            .FirstOrDefaultAsync(s => s.Id == id && s.Character.UserId == userId);

        if (session is null)
            return NotFound(new { message = "Session not found." });

        // Cascade delete will handle events
        _db.Sessions.Remove(session);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Session deleted" });
    }
}
```

- [ ] **Step 4: Add inventory endpoint to CharactersController**

In `src/Vanalytics.Api/Controllers/CharactersController.cs`, add a new action method:

```csharp
[HttpGet("{id:guid}/inventory")]
public async Task<IActionResult> Inventory(Guid id)
{
    var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    var character = await _db.Characters
        .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId);

    if (character is null)
        return NotFound(new { message = "Character not found." });

    var inventory = await _db.CharacterInventories
        .Where(i => i.CharacterId == id)
        .OrderBy(i => i.Bag)
        .ThenBy(i => i.SlotIndex)
        .Select(i => new
        {
            i.ItemId,
            Bag = i.Bag.ToString(),
            i.SlotIndex,
            i.Quantity,
            i.LastSeenAt
        })
        .ToListAsync();

    var grouped = inventory
        .GroupBy(i => i.Bag)
        .ToDictionary(g => g.Key, g => g.ToList());

    return Ok(grouped);
}
```

Ensure the necessary `using Vanalytics.Core.Models;` is present and that `_db` has access to `CharacterInventories`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test tests/Vanalytics.Api.Tests --filter "SessionsController" -v n`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Api/Controllers/SessionsController.cs src/Vanalytics.Api/Controllers/CharactersController.cs tests/Vanalytics.Api.Tests/Controllers/SessionsControllerTests.cs
git commit -m "feat: add SessionsController for frontend and inventory endpoint on CharactersController"
```

---

## Task 9: Frontend Types and API Client

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Add session and inventory TypeScript types**

Add to the end of `src/Vanalytics.Web/src/types/api.ts`:

```typescript
// Session types
export interface SessionSummary {
  id: string
  characterId: string
  characterName: string
  server: string
  zone: string
  startedAt: string
  endedAt: string | null
  status: 'Active' | 'Completed' | 'Abandoned'
  totalDamage: number
  gilEarned: number
  mobsKilled: number
  itemsDropped: number
}

export interface SessionDetail extends SessionSummary {
  dpsAverage: number
  gilPerHour: number
  expGained: number
  healingDone: number
  eventCount: number
}

export interface SessionEvent {
  id: number
  eventType: string
  timestamp: string
  source: string
  target: string
  value: number
  ability: string | null
  itemId: number | null
  zone: string
}

export interface SessionTimelineEntry {
  timestamp: string
  damage: number
  healing: number
  gil: number
  kills: number
}

export interface SessionListResponse {
  totalCount: number
  page: number
  pageSize: number
  sessions: SessionSummary[]
}

export interface SessionEventsResponse {
  totalCount: number
  page: number
  pageSize: number
  events: SessionEvent[]
}

// Inventory types
export interface InventoryItem {
  itemId: number
  bag: string
  slotIndex: number
  quantity: number
  lastSeenAt: string
}

export type InventoryByBag = Record<string, InventoryItem[]>
```

- [ ] **Step 2: Verify frontend build**

Run from `src/Vanalytics.Web`: `npm run build`
Expected: Build succeeded (types are just definitions, no runtime errors)

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/types/api.ts
git commit -m "feat: add TypeScript types for sessions and inventory"
```

---

## Task 10: Sessions List Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/SessionsPage.tsx`
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Create SessionsPage component**

Create `src/Vanalytics.Web/src/pages/SessionsPage.tsx` — a paginated table of sessions with:
- Columns: Date, Character, Zone, Duration, Total Damage, Gil Earned, Drops
- Character filter dropdown (fetched from `/api/characters`)
- Date range filter (from/to date inputs)
- Sortable columns
- Rows link to `/sessions/{id}`
- Uses `api<SessionListResponse>('/api/sessions?...')` for data fetching
- Format duration as `Xh Ym` from `startedAt` and `endedAt`
- Format damage/gil with number formatting (commas)
- Loading state, empty state ("No sessions yet. Start tracking with //va session start in-game.")

- [ ] **Step 2: Add route in App.tsx**

In `src/Vanalytics.Web/src/App.tsx`, add after the bazaar route (line 113):

```tsx
import SessionsPage from './pages/SessionsPage'
import SessionDetailPage from './pages/SessionDetailPage'
```

```tsx
<Route path="/sessions" element={<ProtectedRoute><SessionsPage /></ProtectedRoute>} />
<Route path="/sessions/:id" element={<ProtectedRoute><SessionDetailPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Add sidebar link in Layout.tsx**

In `src/Vanalytics.Web/src/components/Layout.tsx`:

1. Add `'performance'` to the `SectionName` type union (line 14)
2. Add to `getSection` function: `if (pathname.startsWith('/sessions')) return 'performance'`
3. Add a new `SidebarSection` after the Economy section:

```tsx
<SidebarSection label="Performance" icon={<Swords className="h-4 w-4 shrink-0" />} isOpen={openSection === 'performance'} onToggle={() => toggleSection('performance')}>
  <SidebarLink to="/sessions" label="Sessions" icon={<Radio className="h-4 w-4 shrink-0" />} onClick={() => setSidebarOpen(false)} />
</SidebarSection>
```

(`Swords` and `Radio` are already imported from lucide-react)

- [ ] **Step 4: Verify frontend build**

Run from `src/Vanalytics.Web`: `npm run build`
Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Web/src/pages/SessionsPage.tsx src/Vanalytics.Web/src/App.tsx src/Vanalytics.Web/src/components/Layout.tsx
git commit -m "feat: add sessions list page with sidebar navigation"
```

---

## Task 11: Session Detail Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/SessionDetailPage.tsx`

- [ ] **Step 1: Create SessionDetailPage component**

Create `src/Vanalytics.Web/src/pages/SessionDetailPage.tsx` with:

**Header section:**
- Character name, server, zone, start/end time, duration
- Delete button (with confirmation)

**Summary cards row:**
- Total Damage, DPS Average, Gil Earned, Gil/Hour, Items Dropped, Mobs Killed, XP Gained
- Use `api<SessionDetail>(`/api/sessions/${id}`)` for data

**Tabbed content area (4 tabs):**

Tab 1 — Timeline:
- Fetch from `/api/sessions/${id}/timeline`
- Simple table rendering of time-bucketed data (DPS, Gil, Kills per bucket)
- Can enhance with charts in a future iteration

Tab 2 — Combat:
- Fetch events filtered by damage types
- Group by ability name, show: ability, total damage, count, avg damage
- Sort by total damage descending

Tab 3 — Loot:
- Fetch events filtered by ItemDrop and GilGain/GilLoss
- Items table: item name (from ItemId via lookup or event target field), quantity, time
- Gil log: gains and losses with timestamps
- Net gil summary

Tab 4 — Raw Events:
- Fetch from `/api/sessions/${id}/events`
- Event type filter checkboxes
- Paginated scrollable table: Time, Type, Source, Target, Value, Ability, Zone

- [ ] **Step 2: Verify frontend build**

Run from `src/Vanalytics.Web`: `npm run build`
Expected: Build succeeded

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/SessionDetailPage.tsx
git commit -m "feat: add session detail page with timeline, combat, loot, and raw event tabs"
```

---

## Task 12: Inventory Tab on Character Detail Page

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/InventoryTab.tsx`
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

- [ ] **Step 1: Create InventoryTab component**

Create `src/Vanalytics.Web/src/components/character/InventoryTab.tsx`:
- Accepts `characterId: string` prop
- Fetches from `/api/characters/${characterId}/inventory`
- Renders inventory grouped by bag in collapsible sections
- Each bag section shows: bag name, item count
- Items rendered as a list/table: item name (resolve via item ID if possible, or show ID), quantity
- Search input to filter items across all bags
- Loading/empty states

- [ ] **Step 2: Add Inventory tab to CharacterDetailPage**

In `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`:
- Import `InventoryTab` component
- Add "Inventory" as a third tab option alongside existing "Jobs" and "Crafting" tabs
- Render `<InventoryTab characterId={character.id} />` when the Inventory tab is active

- [ ] **Step 3: Verify frontend build**

Run from `src/Vanalytics.Web`: `npm run build`
Expected: Build succeeded

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/character/InventoryTab.tsx src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx
git commit -m "feat: add inventory tab to character detail page"
```

---

## Task 13: Windower Addon — session.lua

**Files:**
- Create: `addon/vanalytics/session.lua`

- [ ] **Step 1: Create session module**

Create `addon/vanalytics/session.lua` with:

**Module structure:**
```lua
local session = {}
local res = require('resources')

-- State
local active = false
local session_id = nil
local file_handle = nil
local file_path = nil
local event_count = 0
local uploaded_count = 0
local start_time = nil

-- Dependencies (set via session.init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil
local log_success_fn = nil

function session.init(deps)
    settings = deps.settings
    http_request_fn = deps.http_request
    json_encode_fn = deps.json_encode
    log_fn = deps.log
    log_error_fn = deps.log_error
    log_success_fn = deps.log_success
end
```

**Chat log parsing patterns** (using Lua `string.match`):
- Filter on `original_mode` in ranges 20-44, 110, 121, 123, 127, 150-151
- Pattern matchers for each event type (damage, healing, kills, drops, gil, exp, skillchains)
- Returns event table: `{t=type, ts=os.time(), s=source, tg=target, v=value, a=ability, i=item_id, z=zone}`

**File I/O:**
- `session.start(character_name, server, zone)` — creates `sessions/` directory if needed, opens JSONL file for appending, calls `POST /api/session/start`, stores session_id
- `session.write_event(event)` — JSON-encodes event and appends line to file
- `session.stop()` — flushes remaining events to API, calls `POST /api/session/stop`, closes file
- `session.flush()` — reads unuploaded lines from file, batches up to 500, POSTs to `/api/session/events`

**Status:**
- `session.is_active()` — returns boolean
- `session.get_status()` — returns event_count, uploaded_count, duration, session_id

**Mid-session auto-flush:**
- `session.check_auto_flush()` — called from prerender timer; if `event_count - uploaded_count > 5000`, triggers flush

**Incoming text handler:**
- `session.on_text(original, modified, original_mode, modified_mode, blocked)` — parses chat line if session active, writes event to file

- [ ] **Step 2: Commit**

```bash
git add addon/vanalytics/session.lua
git commit -m "feat: add session.lua module for chat log parsing and session tracking"
```

---

## Task 14: Windower Addon — inventory.lua

**Files:**
- Create: `addon/vanalytics/inventory.lua`

- [ ] **Step 1: Create inventory module**

Create `addon/vanalytics/inventory.lua` with:

**Module structure:**
```lua
local inventory = {}
local res = require('resources')

-- State
local previous_snapshot = nil

-- Dependencies (set via inventory.init)
local settings = nil
local http_request_fn = nil
local json_encode_fn = nil
local log_fn = nil
local log_error_fn = nil
```

**Bag mapping:**
```lua
local bag_keys = {
    {key = 'inventory', name = 'Inventory'},
    {key = 'safe', name = 'Safe'},
    {key = 'storage', name = 'Storage'},
    {key = 'locker', name = 'Locker'},
    {key = 'satchel', name = 'Satchel'},
    {key = 'sack', name = 'Sack'},
    {key = 'case', name = 'Case'},
    {key = 'wardrobe', name = 'Wardrobe'},
    {key = 'wardrobe2', name = 'Wardrobe2'},
    {key = 'wardrobe3', name = 'Wardrobe3'},
    {key = 'wardrobe4', name = 'Wardrobe4'},
    {key = 'wardrobe5', name = 'Wardrobe5'},
    {key = 'wardrobe6', name = 'Wardrobe6'},
    {key = 'wardrobe7', name = 'Wardrobe7'},
    {key = 'wardrobe8', name = 'Wardrobe8'},
}
```

**Core functions:**
- `inventory.read_snapshot()` — reads all bags via `windower.ffxi.get_items()`, returns table keyed by `bag_name:slot_index` with `{item_id, quantity}`
- `inventory.compute_diff(old_snapshot, new_snapshot)` — compares two snapshots, returns list of changes: `{item_id, bag, slot_index, change_type, qty_before, qty_after}`
- `inventory.sync(character_name, server)` — reads snapshot, computes diff against `previous_snapshot`, POSTs changes to `/api/sync/inventory`, updates `previous_snapshot`

- [ ] **Step 2: Commit**

```bash
git add addon/vanalytics/inventory.lua
git commit -m "feat: add inventory.lua module for inventory diff tracking"
```

---

## Task 15: Integrate Modules into Main Addon

**Files:**
- Modify: `addon/vanalytics/vanalytics.lua`

- [ ] **Step 1: Add require statements and initialization**

Near the top of `vanalytics.lua`, after existing requires:
```lua
local session = require('session')
local inventory = require('inventory')
```

After settings are loaded, initialize both modules:
```lua
session.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
    log_success = log_success,
})

inventory.init({
    settings = settings,
    http_request = http_request,
    json_encode = json_encode,
    log = log,
    log_error = log_error,
})
```

- [ ] **Step 2: Add session commands to addon command handler**

In the `addon command` event handler, add handling for `session` command:
```lua
elseif command == 'session' then
    local subcommand = args[1] and args[1]:lower() or 'help'
    if subcommand == 'start' then
        local player = windower.ffxi.get_player()
        local info = windower.ffxi.get_info()
        if not player then
            log_error('Not logged in.')
            return
        end
        local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
        local zone_name = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'
        session.start(player.name, server_name, zone_name)
    elseif subcommand == 'stop' then
        session.stop()
    elseif subcommand == 'status' then
        session.print_status()
    elseif subcommand == 'flush' then
        session.flush()
    elseif subcommand == 'cleanup' then
        session.cleanup()
    else
        log('Session commands: start | stop | status | flush | cleanup')
    end
```

- [ ] **Step 3: Register incoming text event for session parsing**

Add a new event registration:
```lua
windower.register_event('incoming text', function(original, modified, original_mode, modified_mode, blocked)
    session.on_text(original, modified, original_mode, modified_mode, blocked)
end)
```

- [ ] **Step 4: Hook inventory sync into existing sync timer**

In the `do_sync()` function, after the existing character state sync call, add:
```lua
-- Sync inventory diffs
local player = windower.ffxi.get_player()
local info = windower.ffxi.get_info()
if player and info then
    local server_name = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    inventory.sync(player.name, server_name)
end
```

In the prerender timer, add session auto-flush check:
```lua
-- Check if session needs auto-flush
session.check_auto_flush()
```

- [ ] **Step 5: Update help command**

Add session and inventory info to the help output.

- [ ] **Step 6: Commit**

```bash
git add addon/vanalytics/vanalytics.lua
git commit -m "feat: integrate session and inventory modules into main addon"
```

---

## Task 16: Full Integration Build and Verification

- [ ] **Step 1: Run full backend build**

Run: `dotnet build Vanalytics.sln`
Expected: Build succeeded with no errors

- [ ] **Step 2: Run all backend tests**

Run: `dotnet test Vanalytics.sln -v n`
Expected: All tests pass

- [ ] **Step 3: Run frontend build**

Run from `src/Vanalytics.Web`: `npm run build`
Expected: Build succeeded

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for session tracker and inventory collector"
```
