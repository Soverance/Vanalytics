# Bazaar Tracking Implementation Plan (Sub-spec C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build bazaar presence tracking (passive), bazaar contents tracking (manual browse), staleness expiry, ingestion + read API endpoints, addon packet capture, and replace frontend bazaar placeholders with live UI.

**Architecture:** Two new models (BazaarPresence for passive detection, BazaarListing for browse contents) with upsert logic. Background job expires stale presences. Ingestion endpoints share the economy rate limiter. Addon scans nearby entities for bazaar flags on sync timer and captures bazaar contents packets. Frontend replaces placeholders with server-grouped bazaar activity and per-item bazaar listings.

**Tech Stack:** .NET 10, EF Core, existing EconomyRateLimiter + API key auth, Lua (Windower addon), React/TypeScript/Tailwind.

**Spec:** `docs/specs/2026-03-21-economy-tracking-design.md` — Sub-spec C

**Depends on:** Plans A1/A2 (item database, economy infrastructure) + Plan B (frontend placeholders to replace)

---

## File Structure

```
src/
├── Vanalytics.Core/
│   ├── Models/
│   │   ├── BazaarPresence.cs                    # CREATE
│   │   └── BazaarListing.cs                     # CREATE
│   └── DTOs/
│       └── Economy/
│           ├── BazaarPresenceRequest.cs          # CREATE
│           └── BazaarContentsRequest.cs          # CREATE
├── Vanalytics.Data/
│   ├── VanalyticsDbContext.cs                    # MODIFY: add DbSets
│   ├── Configurations/
│   │   ├── BazaarPresenceConfiguration.cs        # CREATE
│   │   └── BazaarListingConfiguration.cs         # CREATE
│   └── Migrations/                               # CREATE: new migration
├── Vanalytics.Api/
│   ├── Services/
│   │   └── BazaarStalenessJob.cs                 # CREATE: background expiry job
│   ├── Controllers/
│   │   └── EconomyController.cs                  # MODIFY: add bazaar endpoints
│   └── Program.cs                                # MODIFY: register staleness job
addon/
└── vanalytics/
    └── vanalytics.lua                            # MODIFY: add bazaar scanning
src/Vanalytics.Web/src/
├── types/
│   └── api.ts                                    # MODIFY: add bazaar types
├── components/
│   └── economy/
│       ├── BazaarListingsTable.tsx                # CREATE
│       └── BazaarZoneGroup.tsx                    # CREATE
├── pages/
│   ├── BazaarActivityPage.tsx                     # MODIFY: replace placeholder
│   └── ItemDetailPage.tsx                         # MODIFY: replace bazaar placeholder
```

---

### Task 1: BazaarPresence and BazaarListing Models + EF + Migration

**Files:**
- Create: `src/Vanalytics.Core/Models/BazaarPresence.cs`
- Create: `src/Vanalytics.Core/Models/BazaarListing.cs`
- Create: `src/Vanalytics.Data/Configurations/BazaarPresenceConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/BazaarListingConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create BazaarPresence model**

```csharp
// src/Vanalytics.Core/Models/BazaarPresence.cs
namespace Vanalytics.Core.Models;

public class BazaarPresence
{
    public long Id { get; set; }
    public int ServerId { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public string Zone { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public Guid ReportedByUserId { get; set; }

    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
```

- [ ] **Step 2: Create BazaarListing model**

```csharp
// src/Vanalytics.Core/Models/BazaarListing.cs
namespace Vanalytics.Core.Models;

public class BazaarListing
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public int ServerId { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public int Price { get; set; }
    public int Quantity { get; set; }
    public string Zone { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public Guid ReportedByUserId { get; set; }

    public GameItem Item { get; set; } = null!;
    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
```

- [ ] **Step 3: Create BazaarPresenceConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/BazaarPresenceConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class BazaarPresenceConfiguration : IEntityTypeConfiguration<BazaarPresence>
{
    public void Configure(EntityTypeBuilder<BazaarPresence> builder)
    {
        builder.HasKey(p => p.Id);

        builder.HasIndex(p => new { p.ServerId, p.IsActive, p.Zone });
        builder.HasIndex(p => new { p.PlayerName, p.ServerId });

        builder.Property(p => p.PlayerName).HasMaxLength(64).IsRequired();
        builder.Property(p => p.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(p => p.Server)
            .WithMany()
            .HasForeignKey(p => p.ServerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(p => p.ReportedBy)
            .WithMany()
            .HasForeignKey(p => p.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
```

- [ ] **Step 4: Create BazaarListingConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/BazaarListingConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class BazaarListingConfiguration : IEntityTypeConfiguration<BazaarListing>
{
    public void Configure(EntityTypeBuilder<BazaarListing> builder)
    {
        builder.HasKey(l => l.Id);

        builder.HasIndex(l => new { l.ItemId, l.ServerId, l.IsActive });
        builder.HasIndex(l => new { l.SellerName, l.ServerId, l.IsActive });

        builder.Property(l => l.SellerName).HasMaxLength(64).IsRequired();
        builder.Property(l => l.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(l => l.Item)
            .WithMany()
            .HasForeignKey(l => l.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(l => l.Server)
            .WithMany()
            .HasForeignKey(l => l.ServerId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(l => l.ReportedBy)
            .WithMany()
            .HasForeignKey(l => l.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
```

- [ ] **Step 5: Add DbSets to VanalyticsDbContext**

Read existing file, add:
```csharp
public DbSet<BazaarPresence> BazaarPresences => Set<BazaarPresence>();
public DbSet<BazaarListing> BazaarListings => Set<BazaarListing>();
```

- [ ] **Step 6: Build and create migration**

```bash
dotnet build Vanalytics.slnx
dotnet ef migrations add AddBazaarTracking --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
dotnet build Vanalytics.slnx
```

---

### Task 2: Bazaar Staleness Expiry Job

**Files:**
- Create: `src/Vanalytics.Api/Services/BazaarStalenessJob.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Create BazaarStalenessJob**

```csharp
// src/Vanalytics.Api/Services/BazaarStalenessJob.cs
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class BazaarStalenessJob : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BazaarStalenessJob> _logger;
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan StalenessThreshold = TimeSpan.FromMinutes(30);

    public BazaarStalenessJob(IServiceScopeFactory scopeFactory, ILogger<BazaarStalenessJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ExpireStalePresencesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Bazaar staleness check failed");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }

    private async Task ExpireStalePresencesAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var cutoff = DateTimeOffset.UtcNow - StalenessThreshold;

        var expired = await db.BazaarPresences
            .Where(p => p.IsActive && p.LastSeenAt < cutoff)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, false), ct);

        if (expired > 0)
            _logger.LogInformation("Expired {Count} stale bazaar presences", expired);

        // Also expire listings whose seller is no longer active
        var expiredListings = await db.BazaarListings
            .Where(l => l.IsActive && l.LastSeenAt < cutoff)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsActive, false), ct);

        if (expiredListings > 0)
            _logger.LogInformation("Expired {Count} stale bazaar listings", expiredListings);
    }
}
```

- [ ] **Step 2: Register in Program.cs**

Read existing file, add after other hosted services:
```csharp
builder.Services.AddHostedService<BazaarStalenessJob>();
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 3: Bazaar Ingestion DTOs and API Endpoints

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Economy/BazaarPresenceRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Economy/BazaarContentsRequest.cs`
- Modify: `src/Vanalytics.Api/Controllers/EconomyController.cs`

- [ ] **Step 1: Create DTOs**

```csharp
// src/Vanalytics.Core/DTOs/Economy/BazaarPresenceRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class BazaarPresenceRequest
{
    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string Zone { get; set; } = string.Empty;

    [Required]
    public List<BazaarPlayerEntry> Players { get; set; } = [];
}

public class BazaarPlayerEntry
{
    public string Name { get; set; } = string.Empty;
}
```

```csharp
// src/Vanalytics.Core/DTOs/Economy/BazaarContentsRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class BazaarContentsRequest
{
    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string SellerName { get; set; } = string.Empty;

    [Required]
    public string Zone { get; set; } = string.Empty;

    [Required]
    public List<BazaarItemEntry> Items { get; set; } = [];
}

public class BazaarItemEntry
{
    public int ItemId { get; set; }
    public int Price { get; set; }
    public int Quantity { get; set; } = 1;
}
```

- [ ] **Step 2: Add bazaar endpoints to EconomyController**

Read existing `EconomyController.cs`, then add these three methods after the existing `IngestAh` method:

```csharp
    [HttpPost("bazaar/presence")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestBazaarPresence([FromBody] BazaarPresenceRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var now = DateTimeOffset.UtcNow;
        var updated = 0;
        var created = 0;

        foreach (var player in request.Players)
        {
            var existing = await _db.BazaarPresences
                .FirstOrDefaultAsync(p => p.PlayerName == player.Name && p.ServerId == server.Id && p.IsActive);

            if (existing is not null)
            {
                existing.LastSeenAt = now;
                existing.Zone = request.Zone;
                updated++;
            }
            else
            {
                _db.BazaarPresences.Add(new BazaarPresence
                {
                    ServerId = server.Id,
                    PlayerName = player.Name,
                    Zone = request.Zone,
                    IsActive = true,
                    FirstSeenAt = now,
                    LastSeenAt = now,
                    ReportedByUserId = userId,
                });
                created++;
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { created, updated });
    }

    [HttpPost("bazaar")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestBazaarContents([FromBody] BazaarContentsRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var now = DateTimeOffset.UtcNow;

        // Get current active listings for this seller
        var activeListings = await _db.BazaarListings
            .Where(l => l.SellerName == request.SellerName && l.ServerId == server.Id && l.IsActive)
            .ToListAsync();

        var seenItemKeys = new HashSet<string>();

        foreach (var item in request.Items)
        {
            var key = $"{item.ItemId}|{item.Price}";
            seenItemKeys.Add(key);

            var existing = activeListings
                .FirstOrDefault(l => l.ItemId == item.ItemId && l.Price == item.Price);

            if (existing is not null)
            {
                existing.LastSeenAt = now;
                existing.Quantity = item.Quantity;
                existing.Zone = request.Zone;
            }
            else
            {
                _db.BazaarListings.Add(new BazaarListing
                {
                    ItemId = item.ItemId,
                    ServerId = server.Id,
                    SellerName = request.SellerName,
                    Price = item.Price,
                    Quantity = item.Quantity,
                    Zone = request.Zone,
                    IsActive = true,
                    FirstSeenAt = now,
                    LastSeenAt = now,
                    ReportedByUserId = userId,
                });
            }
        }

        // Mark listings not in current scan as inactive
        foreach (var listing in activeListings)
        {
            var key = $"{listing.ItemId}|{listing.Price}";
            if (!seenItemKeys.Contains(key))
                listing.IsActive = false;
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Bazaar contents updated" });
    }

    [HttpGet("bazaar/active")]
    public async Task<IActionResult> GetActiveBazaars(
        [FromQuery] string? server = null,
        [FromQuery] string? zone = null)
    {
        var query = _db.BazaarPresences
            .Where(p => p.IsActive);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(p => p.ServerId == srv.Id);
        }

        if (!string.IsNullOrEmpty(zone))
            query = query.Where(p => p.Zone == zone);

        var presences = await query
            .OrderBy(p => p.Zone)
            .ThenBy(p => p.PlayerName)
            .Select(p => new
            {
                p.PlayerName,
                p.Zone,
                ServerName = p.Server.Name,
                p.LastSeenAt,
            })
            .ToListAsync();

        var grouped = presences
            .GroupBy(p => p.Zone)
            .Select(g => new
            {
                Zone = g.Key,
                PlayerCount = g.Count(),
                Players = g.Select(p => new { p.PlayerName, p.LastSeenAt }).ToList(),
            })
            .ToList();

        return Ok(grouped);
    }
```

- [ ] **Step 3: Add bazaar listing read endpoint to ItemsController**

Read existing `src/Vanalytics.Api/Controllers/ItemsController.cs`, add this method:

```csharp
    [HttpGet("{id:int}/bazaar")]
    public async Task<IActionResult> BazaarListings(
        int id,
        [FromQuery] string? server = null)
    {
        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var query = _db.BazaarListings
            .Where(l => l.ItemId == id && l.IsActive);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(l => l.ServerId == srv.Id);
        }

        var listings = await query
            .OrderBy(l => l.Price)
            .Select(l => new
            {
                l.SellerName,
                l.Price,
                l.Quantity,
                l.Zone,
                l.LastSeenAt,
                ServerName = l.Server.Name,
            })
            .ToListAsync();

        return Ok(listings);
    }
```

- [ ] **Step 4: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 4: Addon Bazaar Scanning

**Files:**
- Modify: `addon/vanalytics/vanalytics.lua`

- [ ] **Step 1: Add bazaar presence scan and contents capture**

Read existing `addon/vanalytics/vanalytics.lua`. Add two new sections BEFORE the chat commands section.

**Section 1: Bazaar Presence Scan (add to existing sync timer callback)**

Find the `do_sync()` function and add a bazaar presence scan call at the end, or add a new function that runs on the same timer. The simplest approach: add a new function and call it from the existing prerender timer alongside `do_sync`:

```lua
-----------------------------------------------------------------------
-- Bazaar Presence Scan (passive, runs on sync timer)
-----------------------------------------------------------------------
local function scan_bazaars()
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    local zone = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'

    local mob_array = windower.ffxi.get_mob_array()
    local bazaar_players = {}

    for _, mob in pairs(mob_array) do
        if mob.spawn_type == 13 and mob.name and mob.name ~= '' then
            -- spawn_type 13 = PC; check bazaar flag in status
            -- The bazaar flag is indicated by the player having a bazaar icon
            -- This is typically in mob.status or a specific flag field
            if mob.bazaar then
                table.insert(bazaar_players, { name = mob.name })
            end
        end
    end

    if #bazaar_players == 0 then return end

    local payload = json_encode({
        server = server,
        zone = zone,
        players = bazaar_players,
    })

    local url = settings.ApiUrl .. '/api/economy/bazaar/presence'

    local http = require('socket.http')
    local ltn12 = require('ltn12')
    http.TIMEOUT = 5

    local response_body = {}
    http.request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['Content-Length'] = tostring(#payload),
            ['X-Api-Key'] = settings.ApiKey,
        },
        source = ltn12.source.string(payload),
        sink = ltn12.sink.table(response_body),
    })
end
```

> **IMPORTANT:** The existing AH packet capture (0x0E7) already has its own `incoming chunk` handler. When implementing, consolidate both into a SINGLE `incoming chunk` handler that dispatches on packet ID (`if id == 0x0E7 then ... elseif id == 0x109 then ...`). Remove the existing separate AH handler and merge it into the combined handler. Also ensure both branches return `false` consistently.

**Section 2: Bazaar Contents Capture (packet 0x109)**

```lua
-----------------------------------------------------------------------
-- Bazaar Contents Packet Capture (packet 0x109)
-- SKELETON: Byte offsets need in-game verification.
-----------------------------------------------------------------------
windower.register_event('incoming chunk', function(id, data)
    if id ~= 0x109 then return false end
    if settings.ApiKey == '' then return false end

    local player = windower.ffxi.get_player()
    if not player then return false end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'
    local zone = res.zones[info.zone] and res.zones[info.zone].en or 'Unknown'

    -- Parse bazaar contents packet (placeholder offsets)
    local seller_name = ''
    for i = 5, 20 do
        local b = data:byte(i)
        if b == 0 then break end
        seller_name = seller_name .. string.char(b)
    end

    if seller_name == '' then return false end

    local items = {}
    local offset = 21
    local entry_size = 12

    while offset + entry_size - 1 <= #data do
        local item_id = data:byte(offset) + data:byte(offset + 1) * 256
        if item_id == 0 then break end

        local price = data:byte(offset + 4) + data:byte(offset + 5) * 256 +
                       data:byte(offset + 6) * 65536 + data:byte(offset + 7) * 16777216

        local quantity = data:byte(offset + 8)

        table.insert(items, {
            itemId = item_id,
            price = price,
            quantity = quantity,
        })

        offset = offset + entry_size
    end

    if #items == 0 then return false end

    local payload = json_encode({
        server = server,
        sellerName = seller_name,
        zone = zone,
        items = items,
    })

    local url = settings.ApiUrl .. '/api/economy/bazaar'

    local http = require('socket.http')
    local ltn12 = require('ltn12')
    http.TIMEOUT = 5

    local response_body = {}
    local result, status_code = http.request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['Content-Length'] = tostring(#payload),
            ['X-Api-Key'] = settings.ApiKey,
        },
        source = ltn12.source.string(payload),
        sink = ltn12.sink.table(response_body),
    })

    if result and status_code == 200 then
        log('Bazaar data submitted: ' .. #items .. ' items from ' .. seller_name)
    end

    return false
end)
```

**Step 2: Update the sync timer to also call scan_bazaars**

Find the prerender handler that calls `do_sync()` and add `scan_bazaars()` alongside it:

```lua
    if timer_elapsed >= timer_interval_seconds then
        timer_elapsed = 0
        do_sync()
        -- Bazaar scan only runs if there are nearby bazaar players (early return in scan_bazaars
        -- if none found). In the worst case, two sequential HTTP calls will briefly freeze the game.
        -- This is acceptable for a 5-15 minute interval.
        scan_bazaars()
    end
```

> **Note:** Both the bazaar presence scan and contents packet capture use placeholder byte offsets that need in-game verification, same as the AH packet skeleton.

---

### Task 5: Frontend Bazaar Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Add bazaar types**

Append to the end of `src/Vanalytics.Web/src/types/api.ts`:

```typescript
// Bazaar
export interface BazaarZoneGroup {
  zone: string
  playerCount: number
  players: BazaarPlayer[]
}

export interface BazaarPlayer {
  playerName: string
  lastSeenAt: string
}

export interface BazaarListingItem {
  sellerName: string
  price: number
  quantity: number
  zone: string
  lastSeenAt: string
  serverName: string
}
```

- [ ] **Step 2: Verify build**

```bash
cd src/Vanalytics.Web && npm run build
```

---

### Task 6: Frontend Bazaar Components

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/BazaarListingsTable.tsx`
- Create: `src/Vanalytics.Web/src/components/economy/BazaarZoneGroup.tsx`

- [ ] **Step 1: Create BazaarListingsTable**

```tsx
// src/Vanalytics.Web/src/components/economy/BazaarListingsTable.tsx
import type { BazaarListingItem } from '../../types/api'

interface Props {
  listings: BazaarListingItem[]
}

export default function BazaarListingsTable({ listings }: Props) {
  if (listings.length === 0) {
    return <p className="text-sm text-gray-500">No active bazaar listings for this item.</p>
  }

  return (
    <div className="rounded border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800/50 text-left text-gray-500">
            <th className="px-4 py-2.5 font-medium">Seller</th>
            <th className="px-4 py-2.5 font-medium">Price</th>
            <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Qty</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Zone</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => (
            <tr key={i} className="border-t border-gray-800">
              <td className="px-4 py-2 text-gray-300">{l.sellerName}</td>
              <td className="px-4 py-2 text-gray-200 font-medium">{l.price.toLocaleString()} gil</td>
              <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{l.quantity}</td>
              <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{l.zone}</td>
              <td className="px-4 py-2 text-gray-500 hidden md:table-cell">
                {new Date(l.lastSeenAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create BazaarZoneGroup**

```tsx
// src/Vanalytics.Web/src/components/economy/BazaarZoneGroup.tsx
import type { BazaarZoneGroup as BazaarZoneGroupType } from '../../types/api'

interface Props {
  group: BazaarZoneGroupType
}

export default function BazaarZoneGroup({ group }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{group.zone}</h3>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {group.playerCount} player{group.playerCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-1">
        {group.players.map((p) => (
          <div key={p.playerName} className="flex items-center justify-between text-sm">
            <span className="text-gray-300">{p.playerName}</span>
            <span className="text-xs text-gray-600">
              {new Date(p.lastSeenAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd src/Vanalytics.Web && npm run build
```

---

### Task 7: Replace BazaarActivityPage Placeholder

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/BazaarActivityPage.tsx`

- [ ] **Step 1: Replace with live bazaar activity page**

Read existing file, then replace entirely:

```tsx
// src/Vanalytics.Web/src/pages/BazaarActivityPage.tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { GameServer, BazaarZoneGroup as BazaarZoneGroupType } from '../types/api'
import BazaarZoneGroup from '../components/economy/BazaarZoneGroup'

export default function BazaarActivityPage() {
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [groups, setGroups] = useState<BazaarZoneGroupType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/servers')
      .then((r) => r.ok ? r.json() : [])
      .then((s: GameServer[]) => {
        setServers(s)
        if (s.length > 0) setSelectedServer(s[0].name)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedServer) return
    setLoading(true)
    fetch(`/api/economy/bazaar/active?server=${selectedServer}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [selectedServer])

  const totalPlayers = groups.reduce((sum, g) => sum + g.playerCount, 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
        <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-6" />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bazaar Activity</h1>
          <p className="text-sm text-gray-500">
            {totalPlayers} player{totalPlayers !== 1 ? 's' : ''} with active bazaars
          </p>
        </div>
        <select
          value={selectedServer}
          onChange={(e) => setSelectedServer(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading bazaar activity...</p>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400 mb-2">No active bazaars detected on {selectedServer}.</p>
          <p className="text-sm text-gray-500 mb-4">
            Bazaar presence is detected by players running the Vanalytics Windower addon.
          </p>
          <Link to="/items" className="text-sm text-blue-400 hover:underline">
            Browse the Item Database
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <BazaarZoneGroup key={g.zone} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd src/Vanalytics.Web && npm run build
```

---

### Task 8: Replace Item Detail Bazaar Placeholder

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ItemDetailPage.tsx`

- [ ] **Step 1: Replace the bazaar "Coming soon" section**

Read existing `ItemDetailPage.tsx`. Find the bazaar placeholder section (the last card with "Bazaar Listings" heading and "Coming soon" text). Replace it with:

```tsx
          {/* Bazaar listings */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Bazaar Listings — {selectedServer}</h2>
            <BazaarListingsTable listings={bazaarListings} />
          </div>
```

Add the import at the top of the file:
```tsx
import BazaarListingsTable from '../components/economy/BazaarListingsTable'
```

Add the state and effect:
```tsx
const [bazaarListings, setBazaarListings] = useState<BazaarListingItem[]>([])
```

Add the type import:
```tsx
import type { GameItemDetail, PriceHistoryResponse, CrossServerResponse, GameServer, BazaarListingItem } from '../types/api'
```

Add the fetch effect (alongside the existing price fetch effect, triggered by server change):
```tsx
  useEffect(() => {
    if (!selectedServer) return
    fetch(`/api/items/${id}/bazaar?server=${selectedServer}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setBazaarListings)
      .catch(() => setBazaarListings([]))
  }, [id, selectedServer])
```

- [ ] **Step 2: Verify build**

```bash
cd src/Vanalytics.Web && npm run build
```

---

### Task 9: Verify Full Build

- [ ] **Step 1: Backend build**

```bash
dotnet build Vanalytics.slnx
```

- [ ] **Step 2: Frontend build**

```bash
cd src/Vanalytics.Web && npm run build
```

Both should pass with no errors.
