# Inventory Anomaly Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect inventory anomalies (duplicates across bags, split stacks, near-capacity bags), display them in the Inventory tab with suggested fixes, and let users create move orders for future addon execution.

**Architecture:** New backend models (DismissedAnomaly, InventoryMoveOrder) and a user-facing controller that analyzes CharacterInventory data joined with GameItems to detect anomalies. Frontend adds an anomaly banner component to the existing InventoryTab. Move orders are stored as Pending for Spec 2 addon execution.

**Tech Stack:** ASP.NET Core / EF Core, React 19, TypeScript, Tailwind CSS

---

### Task 1: Add New Models and Enums

**Files:**
- Create: `src/Vanalytics.Core/Enums/MoveOrderStatus.cs`
- Create: `src/Vanalytics.Core/Models/DismissedAnomaly.cs`
- Create: `src/Vanalytics.Core/Models/InventoryMoveOrder.cs`

- [ ] **Step 1: Create MoveOrderStatus enum**

Create `src/Vanalytics.Core/Enums/MoveOrderStatus.cs`:

```csharp
namespace Vanalytics.Core.Enums;

public enum MoveOrderStatus
{
    Pending,
    Completed,
    Failed,
    Cancelled
}
```

- [ ] **Step 2: Create DismissedAnomaly model**

Create `src/Vanalytics.Core/Models/DismissedAnomaly.cs`:

```csharp
namespace Vanalytics.Core.Models;

public class DismissedAnomaly
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public string AnomalyKey { get; set; } = string.Empty;
    public DateTimeOffset DismissedAt { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 3: Create InventoryMoveOrder model**

Create `src/Vanalytics.Core/Models/InventoryMoveOrder.cs`:

```csharp
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class InventoryMoveOrder
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag FromBag { get; set; }
    public int FromSlot { get; set; }
    public InventoryBag ToBag { get; set; }
    public int Quantity { get; set; }
    public MoveOrderStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public Character Character { get; set; } = null!;
}
```

- [ ] **Step 4: Commit**

```
feat: add DismissedAnomaly, InventoryMoveOrder models and MoveOrderStatus enum
```

---

### Task 2: Add EF Core Configurations and DbSets

**Files:**
- Create: `src/Vanalytics.Data/Configurations/DismissedAnomalyConfiguration.cs`
- Create: `src/Vanalytics.Data/Configurations/InventoryMoveOrderConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create DismissedAnomalyConfiguration**

Create `src/Vanalytics.Data/Configurations/DismissedAnomalyConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class DismissedAnomalyConfiguration : IEntityTypeConfiguration<DismissedAnomaly>
{
    public void Configure(EntityTypeBuilder<DismissedAnomaly> builder)
    {
        builder.HasKey(d => d.Id);

        builder.HasIndex(d => new { d.CharacterId, d.AnomalyKey }).IsUnique();

        builder.Property(d => d.AnomalyKey).HasMaxLength(128).IsRequired();

        builder.HasOne(d => d.Character)
            .WithMany()
            .HasForeignKey(d => d.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 2: Create InventoryMoveOrderConfiguration**

Create `src/Vanalytics.Data/Configurations/InventoryMoveOrderConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class InventoryMoveOrderConfiguration : IEntityTypeConfiguration<InventoryMoveOrder>
{
    public void Configure(EntityTypeBuilder<InventoryMoveOrder> builder)
    {
        builder.HasKey(m => m.Id);

        builder.HasIndex(m => new { m.CharacterId, m.Status });

        builder.HasOne(m => m.Character)
            .WithMany()
            .HasForeignKey(m => m.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
```

- [ ] **Step 3: Add DbSets to VanalyticsDbContext**

In `src/Vanalytics.Data/VanalyticsDbContext.cs`, add after the existing `MacroBooks`/`MacroPages`/`Macros` DbSets (around line 30):

```csharp
    public DbSet<DismissedAnomaly> DismissedAnomalies => Set<DismissedAnomaly>();
    public DbSet<InventoryMoveOrder> InventoryMoveOrders => Set<InventoryMoveOrder>();
```

- [ ] **Step 4: Commit**

```
feat: add EF configurations and DbSets for DismissedAnomaly and InventoryMoveOrder
```

---

### Task 3: Create EF Core Migration

**Files:**
- Create: new migration in `src/Vanalytics.Data/Migrations/`

- [ ] **Step 1: Generate migration**

Run from `src/Vanalytics.Api`:

```bash
dotnet ef migrations add AddInventoryAnomalyTables --project ../Vanalytics.Data
```

This creates the migration file. Verify it contains `CreateTable` for both `DismissedAnomalies` and `InventoryMoveOrders`.

- [ ] **Step 2: Verify the build compiles**

```bash
dotnet build --nologo
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
feat: add migration for DismissedAnomalies and InventoryMoveOrders tables
```

---

### Task 4: Add DTOs for Anomaly API

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Inventory/AnomalyResponse.cs`

- [ ] **Step 1: Create all anomaly DTOs in a single file**

Create `src/Vanalytics.Core/DTOs/Inventory/AnomalyResponse.cs`:

```csharp
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.DTOs.Inventory;

public class AnomalyResponse
{
    public List<Anomaly> Anomalies { get; set; } = [];
    public int DismissedCount { get; set; }
    public List<string> DismissedKeys { get; set; } = [];
    public List<MoveOrderResponse> PendingMoves { get; set; } = [];
}

public class Anomaly
{
    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = "info";
    public string AnomalyKey { get; set; } = string.Empty;
    public int? ItemId { get; set; }
    public string? ItemName { get; set; }
    public List<string> Bags { get; set; } = [];
    public AnomalyDetails Details { get; set; } = new();
    public SuggestedFix? SuggestedFix { get; set; }
}

public class AnomalyDetails
{
    // For duplicate / splitStack
    public List<SlotInfo>? Slots { get; set; }
    // For nearCapacity
    public string? BagName { get; set; }
    public int? UsedSlots { get; set; }
    public int? MaxSlots { get; set; }
}

public class SlotInfo
{
    public string Bag { get; set; } = string.Empty;
    public int SlotIndex { get; set; }
    public int Quantity { get; set; }
}

public class SuggestedFix
{
    public List<MoveInstruction> Moves { get; set; } = [];
}

public class MoveInstruction
{
    public int ItemId { get; set; }
    public string FromBag { get; set; } = string.Empty;
    public int FromSlot { get; set; }
    public string ToBag { get; set; } = string.Empty;
    public int Quantity { get; set; }
}

public class MoveOrderResponse
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string FromBag { get; set; } = string.Empty;
    public int FromSlot { get; set; }
    public string ToBag { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

public class DismissRequest
{
    public string AnomalyKey { get; set; } = string.Empty;
}

public class CreateMovesRequest
{
    public List<MoveInstruction> Moves { get; set; } = [];
}
```

- [ ] **Step 2: Commit**

```
feat: add anomaly DTOs for inventory management API
```

---

### Task 5: Create InventoryManagementController

**Files:**
- Create: `src/Vanalytics.Api/Controllers/InventoryManagementController.cs`

- [ ] **Step 1: Create the controller with all endpoints**

Create `src/Vanalytics.Api/Controllers/InventoryManagementController.cs`:

```csharp
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Inventory;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters/{characterId:guid}/inventory")]
[Authorize]
public class InventoryManagementController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private const int MaxSlotsPerBag = 80;
    private const double NearCapacityThreshold = 0.90;

    public InventoryManagementController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("anomalies")]
    public async Task<IActionResult> GetAnomalies(Guid characterId)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        // Load inventory with item metadata
        var inventory = await _db.CharacterInventories
            .Where(i => i.CharacterId == characterId)
            .Join(_db.GameItems,
                ci => ci.ItemId,
                gi => gi.ItemId,
                (ci, gi) => new
                {
                    ci.ItemId,
                    ci.Bag,
                    ci.SlotIndex,
                    ci.Quantity,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.StackSize
                })
            .ToListAsync();

        // Load dismissed keys
        var dismissedKeys = await _db.DismissedAnomalies
            .Where(d => d.CharacterId == characterId)
            .Select(d => d.AnomalyKey)
            .ToListAsync();

        var dismissedSet = new HashSet<string>(dismissedKeys);

        // Load pending move item IDs to suppress resolved anomalies
        var pendingMoveItemIds = await _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId && m.Status == MoveOrderStatus.Pending)
            .Select(m => m.ItemId)
            .Distinct()
            .ToListAsync();

        var pendingItemSet = new HashSet<int>(pendingMoveItemIds);

        // Load pending moves for response
        var pendingMoves = await _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId && m.Status == MoveOrderStatus.Pending)
            .Join(_db.GameItems, m => m.ItemId, g => g.ItemId, (m, g) => new MoveOrderResponse
            {
                Id = m.Id,
                ItemId = m.ItemId,
                ItemName = g.Name ?? g.NameJa ?? "Unknown",
                FromBag = m.FromBag.ToString(),
                FromSlot = m.FromSlot,
                ToBag = m.ToBag.ToString(),
                Quantity = m.Quantity,
                Status = m.Status.ToString(),
                CreatedAt = m.CreatedAt
            })
            .ToListAsync();

        var anomalies = new List<Anomaly>();

        // --- Detect duplicates and split stacks ---
        var byItem = inventory.GroupBy(i => i.ItemId);

        foreach (var group in byItem)
        {
            var items = group.ToList();
            var itemId = group.Key;
            var itemName = items[0].ItemName;
            var stackSize = items[0].StackSize;
            var bags = items.Select(i => i.Bag.ToString()).Distinct().ToList();

            // Duplicate: same item in 2+ bags
            if (bags.Count >= 2)
            {
                var key = $"duplicate:{itemId}";
                if (!dismissedSet.Contains(key) && !pendingItemSet.Contains(itemId))
                {
                    var slots = items.Select(i => new SlotInfo
                    {
                        Bag = i.Bag.ToString(),
                        SlotIndex = i.SlotIndex,
                        Quantity = i.Quantity
                    }).ToList();

                    // Suggest consolidating to the bag with the most of this item
                    var targetBag = items
                        .GroupBy(i => i.Bag)
                        .OrderByDescending(g => g.Sum(x => x.Quantity))
                        .First().Key;

                    var moves = items
                        .Where(i => i.Bag != targetBag)
                        .Select(i => new MoveInstruction
                        {
                            ItemId = itemId,
                            FromBag = i.Bag.ToString(),
                            FromSlot = i.SlotIndex,
                            ToBag = targetBag.ToString(),
                            Quantity = i.Quantity
                        }).ToList();

                    anomalies.Add(new Anomaly
                    {
                        Type = "duplicate",
                        Severity = "warning",
                        AnomalyKey = key,
                        ItemId = itemId,
                        ItemName = itemName,
                        Bags = bags,
                        Details = new AnomalyDetails { Slots = slots },
                        SuggestedFix = moves.Count > 0 ? new SuggestedFix { Moves = moves } : null
                    });
                }
            }

            // Split stack: stackable item in more slots than necessary
            if (stackSize > 1 && items.Count >= 2)
            {
                var totalQty = items.Sum(i => i.Quantity);
                var minSlots = (int)Math.Ceiling((double)totalQty / stackSize);

                if (items.Count > minSlots)
                {
                    var key = $"splitStack:{itemId}";
                    if (!dismissedSet.Contains(key) && !pendingItemSet.Contains(itemId))
                    {
                        var slots = items.Select(i => new SlotInfo
                        {
                            Bag = i.Bag.ToString(),
                            SlotIndex = i.SlotIndex,
                            Quantity = i.Quantity
                        }).ToList();

                        // Suggest consolidating to the slot with the most
                        var targetSlot = items.OrderByDescending(i => i.Quantity).First();
                        var moves = items
                            .Where(i => !(i.Bag == targetSlot.Bag && i.SlotIndex == targetSlot.SlotIndex))
                            .Select(i => new MoveInstruction
                            {
                                ItemId = itemId,
                                FromBag = i.Bag.ToString(),
                                FromSlot = i.SlotIndex,
                                ToBag = targetSlot.Bag.ToString(),
                                Quantity = i.Quantity
                            }).ToList();

                        anomalies.Add(new Anomaly
                        {
                            Type = "splitStack",
                            Severity = "info",
                            AnomalyKey = key,
                            ItemId = itemId,
                            ItemName = itemName,
                            Bags = bags,
                            Details = new AnomalyDetails { Slots = slots },
                            SuggestedFix = moves.Count > 0 ? new SuggestedFix { Moves = moves } : null
                        });
                    }
                }
            }
        }

        // --- Detect near-capacity bags ---
        var slotsByBag = inventory.GroupBy(i => i.Bag);
        foreach (var bagGroup in slotsByBag)
        {
            var usedSlots = bagGroup.Count();
            if ((double)usedSlots / MaxSlotsPerBag >= NearCapacityThreshold)
            {
                var bagName = bagGroup.Key.ToString();
                var key = $"nearCapacity:{bagName}";
                if (!dismissedSet.Contains(key))
                {
                    anomalies.Add(new Anomaly
                    {
                        Type = "nearCapacity",
                        Severity = "warning",
                        AnomalyKey = key,
                        Bags = [bagName],
                        Details = new AnomalyDetails
                        {
                            BagName = bagName,
                            UsedSlots = usedSlots,
                            MaxSlots = MaxSlotsPerBag
                        }
                    });
                }
            }
        }

        return Ok(new AnomalyResponse
        {
            Anomalies = anomalies,
            DismissedCount = dismissedKeys.Count,
            DismissedKeys = dismissedKeys,
            PendingMoves = pendingMoves
        });
    }

    [HttpPost("dismiss")]
    public async Task<IActionResult> Dismiss(Guid characterId, [FromBody] DismissRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var existing = await _db.DismissedAnomalies
            .FirstOrDefaultAsync(d => d.CharacterId == characterId && d.AnomalyKey == request.AnomalyKey);

        if (existing is not null)
            return Ok(new { message = "Already dismissed" });

        _db.DismissedAnomalies.Add(new DismissedAnomaly
        {
            CharacterId = characterId,
            AnomalyKey = request.AnomalyKey,
            DismissedAt = DateTimeOffset.UtcNow
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Dismissed" });
    }

    [HttpDelete("dismiss/{anomalyKey}")]
    public async Task<IActionResult> Undismiss(Guid characterId, string anomalyKey)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var dismissed = await _db.DismissedAnomalies
            .FirstOrDefaultAsync(d => d.CharacterId == characterId && d.AnomalyKey == anomalyKey);

        if (dismissed is null) return NotFound();

        _db.DismissedAnomalies.Remove(dismissed);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Un-dismissed" });
    }

    [HttpPost("moves")]
    public async Task<IActionResult> CreateMoves(Guid characterId, [FromBody] CreateMovesRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var now = DateTimeOffset.UtcNow;

        foreach (var move in request.Moves)
        {
            if (!Enum.TryParse<InventoryBag>(move.FromBag, true, out var fromBag) ||
                !Enum.TryParse<InventoryBag>(move.ToBag, true, out var toBag))
                continue;

            _db.InventoryMoveOrders.Add(new InventoryMoveOrder
            {
                CharacterId = characterId,
                ItemId = move.ItemId,
                FromBag = fromBag,
                FromSlot = move.FromSlot,
                ToBag = toBag,
                Quantity = move.Quantity,
                Status = MoveOrderStatus.Pending,
                CreatedAt = now
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Move orders created" });
    }

    [HttpGet("moves")]
    public async Task<IActionResult> GetMoves(Guid characterId, [FromQuery] string? status)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var query = _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId);

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<MoveOrderStatus>(status, true, out var parsed))
            query = query.Where(m => m.Status == parsed);

        var moves = await query
            .OrderByDescending(m => m.CreatedAt)
            .Join(_db.GameItems, m => m.ItemId, g => g.ItemId, (m, g) => new MoveOrderResponse
            {
                Id = m.Id,
                ItemId = m.ItemId,
                ItemName = g.Name ?? g.NameJa ?? "Unknown",
                FromBag = m.FromBag.ToString(),
                FromSlot = m.FromSlot,
                ToBag = m.ToBag.ToString(),
                Quantity = m.Quantity,
                Status = m.Status.ToString(),
                CreatedAt = m.CreatedAt
            })
            .ToListAsync();

        return Ok(moves);
    }

    [HttpDelete("moves/{id:long}")]
    public async Task<IActionResult> CancelMove(Guid characterId, long id)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var move = await _db.InventoryMoveOrders
            .FirstOrDefaultAsync(m => m.Id == id && m.CharacterId == characterId);

        if (move is null) return NotFound();

        if (move.Status != MoveOrderStatus.Pending)
            return BadRequest(new { message = "Only pending moves can be cancelled" });

        move.Status = MoveOrderStatus.Cancelled;
        move.CompletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Move cancelled" });
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
```

- [ ] **Step 2: Verify build**

```bash
dotnet build --nologo
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
feat: add InventoryManagementController with anomaly detection and move orders
```

---

### Task 6: Add Frontend Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Add anomaly and move order types**

In `src/Vanalytics.Web/src/types/api.ts`, add after the `InventoryByBag` type (around line 589):

```typescript
export interface SlotInfo {
  bag: string
  slotIndex: number
  quantity: number
}

export interface MoveInstruction {
  itemId: number
  fromBag: string
  fromSlot: number
  toBag: string
  quantity: number
}

export interface SuggestedFix {
  moves: MoveInstruction[]
}

export interface AnomalyDetails {
  slots?: SlotInfo[]
  bagName?: string
  usedSlots?: number
  maxSlots?: number
}

export interface Anomaly {
  type: 'duplicate' | 'splitStack' | 'nearCapacity'
  severity: 'info' | 'warning'
  anomalyKey: string
  itemId: number | null
  itemName: string | null
  bags: string[]
  details: AnomalyDetails
  suggestedFix: SuggestedFix | null
}

export interface MoveOrderResponse {
  id: number
  itemId: number
  itemName: string
  fromBag: string
  fromSlot: number
  toBag: string
  quantity: number
  status: string
  createdAt: string
}

export interface AnomalyResponse {
  anomalies: Anomaly[]
  dismissedCount: number
  dismissedKeys: string[]
  pendingMoves: MoveOrderResponse[]
}
```

- [ ] **Step 2: Commit**

```
feat: add frontend types for inventory anomalies and move orders
```

---

### Task 7: Create InventoryAnomalyBanner Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/InventoryAnomalyBanner.tsx`

- [ ] **Step 1: Create the component**

Create `src/Vanalytics.Web/src/components/character/InventoryAnomalyBanner.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { AnomalyResponse, Anomaly, MoveOrderResponse } from '../../types/api'

interface InventoryAnomalyBannerProps {
  characterId: string
}

const BAG_OPTIONS = [
  'Inventory', 'Safe', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

export default function InventoryAnomalyBanner({ characterId }: InventoryAnomalyBannerProps) {
  const [data, setData] = useState<AnomalyResponse | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [dismissedAnomalies, setDismissedAnomalies] = useState<Anomaly[]>([])
  const [overrideBags, setOverrideBags] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const fetchAnomalies = () => {
    setLoading(true)
    api<AnomalyResponse>(`/api/characters/${characterId}/inventory/anomalies`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAnomalies() }, [characterId])

  const handleDismiss = async (anomalyKey: string) => {
    await api(`/api/characters/${characterId}/inventory/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anomalyKey }),
    })
    fetchAnomalies()
  }

  const handleUndismiss = async (anomalyKey: string) => {
    await api(`/api/characters/${characterId}/inventory/dismiss/${encodeURIComponent(anomalyKey)}`, {
      method: 'DELETE',
    })
    fetchAnomalies()
  }

  const handleResolve = async (anomaly: Anomaly) => {
    if (!anomaly.suggestedFix) return
    const overrideBag = overrideBags[anomaly.anomalyKey]
    const moves = overrideBag
      ? anomaly.suggestedFix.moves.map(m => ({ ...m, toBag: overrideBag }))
      : anomaly.suggestedFix.moves

    await api(`/api/characters/${characterId}/inventory/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves }),
    })
    fetchAnomalies()
  }

  const handleCancelMove = async (moveId: number) => {
    await api(`/api/characters/${characterId}/inventory/moves/${moveId}`, {
      method: 'DELETE',
    })
    fetchAnomalies()
  }

  if (loading || !data) return null
  if (data.anomalies.length === 0 && data.pendingMoves.length === 0 && data.dismissedCount === 0) return null

  return (
    <div className="mb-4 space-y-3">
      {/* Pending moves */}
      {data.pendingMoves.length > 0 && (
        <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-3">
          <h4 className="text-sm font-medium text-blue-400 mb-2">
            Pending Moves ({data.pendingMoves.length})
          </h4>
          <div className="space-y-1">
            {data.pendingMoves.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  {m.itemName}: {m.fromBag}:{m.fromSlot} → {m.toBag} (x{m.quantity})
                </span>
                <button
                  onClick={() => handleCancelMove(m.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active anomalies */}
      {data.anomalies.length > 0 && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-amber-400">
              {data.anomalies.length} inventory issue{data.anomalies.length !== 1 ? 's' : ''} found
            </h4>
            {data.dismissedCount > 0 && (
              <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                {data.dismissedCount} dismissed {showDismissed ? '▴' : '▾'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {data.anomalies.map((a) => (
              <AnomalyCard
                key={a.anomalyKey}
                anomaly={a}
                overrideBag={overrideBags[a.anomalyKey]}
                onOverrideBag={(bag) =>
                  setOverrideBags((prev) => ({ ...prev, [a.anomalyKey]: bag }))
                }
                onResolve={() => handleResolve(a)}
                onDismiss={() => handleDismiss(a.anomalyKey)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dismissed anomalies (expandable) */}
      {showDismissed && data.dismissedKeys.length > 0 && (
        <DismissedList dismissedKeys={data.dismissedKeys} onUndismiss={handleUndismiss} />
      )}
    </div>
  )
}

function AnomalyCard({ anomaly, overrideBag, onOverrideBag, onResolve, onDismiss }: {
  anomaly: Anomaly
  overrideBag: string | undefined
  onOverrideBag: (bag: string) => void
  onResolve: () => void
  onDismiss: () => void
}) {
  if (anomaly.type === 'nearCapacity') {
    return (
      <div className="flex items-center justify-between text-sm border-b border-amber-900/50 pb-2">
        <span className="text-gray-300">
          <span className="text-amber-400 font-medium">{anomaly.details.bagName}</span>: {anomaly.details.usedSlots}/{anomaly.details.maxSlots} slots used ({Math.round((anomaly.details.usedSlots! / anomaly.details.maxSlots!) * 100)}%)
        </span>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400">Dismiss</button>
      </div>
    )
  }

  const typeLabel = anomaly.type === 'duplicate' ? 'Duplicate' : 'Split Stack'
  const targetBag = overrideBag || anomaly.suggestedFix?.moves[0]?.toBag || ''

  return (
    <div className="border-b border-amber-900/50 pb-2 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-amber-300 font-medium">{typeLabel}: </span>
          <span className="text-gray-200">{anomaly.itemName}</span>
          <div className="text-gray-500 text-xs mt-1">
            {anomaly.details.slots?.map((s, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {s.bag} slot {s.slotIndex} (x{s.quantity})
              </span>
            ))}
          </div>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400 shrink-0">Dismiss</button>
      </div>
      {anomaly.suggestedFix && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-gray-500 text-xs">Consolidate to:</span>
          <select
            value={targetBag}
            onChange={(e) => onOverrideBag(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300"
          >
            {BAG_OPTIONS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button
            onClick={onResolve}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  )
}

function DismissedList({ dismissedKeys, onUndismiss }: {
  dismissedKeys: string[]
  onUndismiss: (key: string) => void
}) {
  if (dismissedKeys.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Dismissed</h4>
      <div className="space-y-1">
        {dismissedKeys.map((key) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{key}</span>
            <button
              onClick={() => onUndismiss(key)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Un-dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
feat: add InventoryAnomalyBanner component
```

---

### Task 8: Integrate Banner into InventoryTab

**Files:**
- Modify: `src/Vanalytics.Web/src/components/character/InventoryTab.tsx`

- [ ] **Step 1: Add import and render the banner**

In `src/Vanalytics.Web/src/components/character/InventoryTab.tsx`, add the import after the existing imports (around line 4):

```typescript
import InventoryAnomalyBanner from './InventoryAnomalyBanner'
```

Find the return statement's opening `<div>` or fragment. The component currently renders search/filter controls followed by the bag tabs and item table. Add the banner as the first child, before the search controls:

Find the first element inside the return (likely a `<div className="space-y-4">` or similar wrapper). Add immediately inside it:

```tsx
      <InventoryAnomalyBanner characterId={characterId} />
```

This renders the banner at the top of the Inventory tab. When there are no anomalies, the banner returns `null` and is invisible.

- [ ] **Step 2: Verify frontend compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
feat: integrate anomaly banner into InventoryTab
```

---

### Task 9: Verify Full Build

**Files:**
- Verify all new and modified files

- [ ] **Step 1: Backend build**

```bash
cd src/Vanalytics.Api && dotnet build --nologo
```

Expected: 0 errors.

- [ ] **Step 2: Frontend type check**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Verify file structure**

Confirm these files exist:
```
src/Vanalytics.Core/Enums/MoveOrderStatus.cs
src/Vanalytics.Core/Models/DismissedAnomaly.cs
src/Vanalytics.Core/Models/InventoryMoveOrder.cs
src/Vanalytics.Data/Configurations/DismissedAnomalyConfiguration.cs
src/Vanalytics.Data/Configurations/InventoryMoveOrderConfiguration.cs
src/Vanalytics.Core/DTOs/Inventory/AnomalyResponse.cs
src/Vanalytics.Api/Controllers/InventoryManagementController.cs
src/Vanalytics.Web/src/components/character/InventoryAnomalyBanner.tsx
```

- [ ] **Step 4: Final commit if any fixes needed**

```
fix: resolve build issues in inventory anomaly detection
```
