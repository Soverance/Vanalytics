# Admin-Triggered Resource Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace startup-blocking item seeding with an admin-triggered sync system that provides real-time SSE progress, supports cancellation, and is generic enough to add new resource types.

**Architecture:** Generic `ISyncProvider` interface with per-provider sync cards. `SyncOrchestrator` singleton manages jobs and progress channels. `AdminSyncController` exposes start/cancel/progress endpoints. Frontend uses `fetch()` with `ReadableStream` for SSE progress streaming (not `EventSource`, which can't set Authorization headers for JWT). Two initial providers: `ItemSyncProvider` (items from Windower Resources) and `IconSyncProvider` (icons from ffxiah.com).

**Tech Stack:** .NET 10, ASP.NET Core SSE, System.Threading.Channels, EF Core 10, React 19, TypeScript, fetch + ReadableStream

**Spec:** `docs/superpowers/specs/2026-03-21-admin-sync-design.md`

**Important:** The user (Scott) handles all git operations. Do NOT run git add/commit/push. Do NOT run EF migration scaffold commands.

---

### Task 1: Sync framework — interfaces, events, SyncHistory model

Create the core types that everything else depends on.

**Files:**
- Create: `src/Vanalytics.Api/Services/Sync/ISyncProvider.cs`
- Create: `src/Vanalytics.Api/Services/Sync/SyncProgressEvent.cs`
- Create: `src/Vanalytics.Core/Models/SyncHistory.cs`
- Create: `src/Vanalytics.Data/Configurations/SyncHistoryConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create ISyncProvider.cs**

```csharp
namespace Vanalytics.Api.Services.Sync;

public interface ISyncProvider
{
    string ProviderId { get; }
    string DisplayName { get; }
    Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct);
}
```

- [ ] **Step 2: Create SyncProgressEvent.cs**

```csharp
namespace Vanalytics.Api.Services.Sync;

public enum SyncEventType { Started, Progress, Completed, Failed, Cancelled }

public record SyncProgressEvent
{
    public required string ProviderId { get; init; }
    public required SyncEventType Type { get; init; }
    public string? Message { get; init; }
    public string? CurrentItem { get; init; }
    public int? CurrentItemId { get; init; }
    public int Current { get; init; }
    public int Total { get; init; }
    public int Added { get; init; }
    public int Updated { get; init; }
    public int Skipped { get; init; }
    public int Failed { get; init; }
}
```

- [ ] **Step 3: Create SyncHistory.cs**

```csharp
namespace Vanalytics.Core.Models;

public class SyncHistory
{
    public int Id { get; set; }
    public string ProviderId { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public int ItemsAdded { get; set; }
    public int ItemsUpdated { get; set; }
    public int ItemsSkipped { get; set; }
    public int ItemsFailed { get; set; }
    public int TotalItems { get; set; }
    public string? ErrorMessage { get; set; }
}
```

- [ ] **Step 4: Create SyncHistoryConfiguration.cs**

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SyncHistoryConfiguration : IEntityTypeConfiguration<SyncHistory>
{
    public void Configure(EntityTypeBuilder<SyncHistory> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.ProviderId).IsRequired().HasMaxLength(64);
        builder.Property(s => s.Status).IsRequired().HasMaxLength(32);
        builder.Property(s => s.ErrorMessage).HasMaxLength(2000);
        builder.HasIndex(s => new { s.ProviderId, s.StartedAt });
    }
}
```

- [ ] **Step 5: Add SyncHistory DbSet to VanalyticsDbContext**

Add to VanalyticsDbContext.cs:
```csharp
public DbSet<SyncHistory> SyncHistory => Set<SyncHistory>();
```

Add `using Vanalytics.Core.Models;` if not already present (it should be from existing DbSets).

- [ ] **Step 6: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`
Expected: Build succeeded.

- [ ] **Step 7: Commit**

```
feat: add sync framework types (ISyncProvider, SyncProgressEvent, SyncHistory)
```

---

### Task 2: SyncOrchestrator — job management and progress channels

**Files:**
- Create: `src/Vanalytics.Api/Services/Sync/SyncOrchestrator.cs`

- [ ] **Step 1: Create SyncOrchestrator.cs**

```csharp
using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class SyncJob
{
    public required string ProviderId { get; init; }
    public required CancellationTokenSource Cts { get; init; }
    public required Channel<SyncProgressEvent> Channel { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
}

public class SyncOrchestrator
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SyncOrchestrator> _logger;
    private readonly ConcurrentDictionary<string, SyncJob> _activeJobs = new();

    public SyncOrchestrator(
        IServiceScopeFactory scopeFactory,
        IServiceProvider serviceProvider,
        ILogger<SyncOrchestrator> logger)
    {
        _scopeFactory = scopeFactory;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public bool IsRunning(string providerId) => _activeJobs.ContainsKey(providerId);

    public SyncJob? GetJob(string providerId) =>
        _activeJobs.TryGetValue(providerId, out var job) ? job : null;

    public IReadOnlyCollection<string> GetActiveProviderIds() => _activeJobs.Keys.ToList();

    public bool TryStart(string providerId, out SyncJob? job)
    {
        job = null;

        var provider = _serviceProvider.GetKeyedService<ISyncProvider>(providerId);
        if (provider is null) return false;

        var channel = Channel.CreateUnbounded<SyncProgressEvent>();
        var cts = new CancellationTokenSource();

        var newJob = new SyncJob
        {
            ProviderId = providerId,
            Cts = cts,
            Channel = channel,
            StartedAt = DateTimeOffset.UtcNow
        };

        if (!_activeJobs.TryAdd(providerId, newJob))
        {
            cts.Dispose();
            return false; // Already running
        }

        job = newJob;

        _ = Task.Run(async () =>
        {
            // Track the last event's counters for writing to SyncHistory
            SyncProgressEvent lastEvent = new() { ProviderId = providerId, Type = SyncEventType.Started };

            var progress = new Progress<SyncProgressEvent>(evt =>
            {
                lastEvent = evt;
                channel.Writer.TryWrite(evt);
            });

            SyncHistory history;
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                history = new SyncHistory
                {
                    ProviderId = providerId,
                    StartedAt = DateTimeOffset.UtcNow,
                    Status = "Running"
                };
                db.SyncHistory.Add(history);
                await db.SaveChangesAsync();
            }

            try
            {
                await provider.SyncAsync(progress, cts.Token);

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                var record = await db.SyncHistory.FindAsync(history.Id);
                if (record is not null)
                {
                    record.CompletedAt = DateTimeOffset.UtcNow;
                    record.Status = "Completed";
                    record.ItemsAdded = lastEvent.Added;
                    record.ItemsUpdated = lastEvent.Updated;
                    record.ItemsSkipped = lastEvent.Skipped;
                    record.ItemsFailed = lastEvent.Failed;
                    record.TotalItems = lastEvent.Total;
                    await db.SaveChangesAsync();
                }
            }
            catch (OperationCanceledException)
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                var record = await db.SyncHistory.FindAsync(history.Id);
                if (record is not null)
                {
                    record.CompletedAt = DateTimeOffset.UtcNow;
                    record.Status = "Cancelled";
                    record.ItemsAdded = lastEvent.Added;
                    record.ItemsUpdated = lastEvent.Updated;
                    record.ItemsFailed = lastEvent.Failed;
                    record.TotalItems = lastEvent.Total;
                    await db.SaveChangesAsync();
                }

                channel.Writer.TryWrite(new SyncProgressEvent
                {
                    ProviderId = providerId,
                    Type = SyncEventType.Cancelled,
                    Message = "Sync cancelled by user"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync failed for provider {ProviderId}", providerId);

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                var record = await db.SyncHistory.FindAsync(history.Id);
                if (record is not null)
                {
                    record.CompletedAt = DateTimeOffset.UtcNow;
                    record.Status = "Failed";
                    record.ErrorMessage = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
                    await db.SaveChangesAsync();
                }

                channel.Writer.TryWrite(new SyncProgressEvent
                {
                    ProviderId = providerId,
                    Type = SyncEventType.Failed,
                    Message = ex.Message
                });
            }
            finally
            {
                channel.Writer.TryComplete();
                _activeJobs.TryRemove(providerId, out _);
                cts.Dispose();
            }
        });

        return true;
    }

    public bool TryCancel(string providerId)
    {
        if (!_activeJobs.TryGetValue(providerId, out var job)) return false;
        job.Cts.Cancel();
        return true;
    }

    /// <summary>
    /// Record a sync history entry for background (non-admin-triggered) syncs.
    /// Called by ItemDatabaseSyncJob after its 24h sync completes.
    /// </summary>
    public async Task RecordBackgroundSyncAsync(string providerId, int added, int updated, int total, string? error = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var history = new SyncHistory
        {
            ProviderId = providerId,
            StartedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow,
            Status = error is null ? "Completed" : "Failed",
            ItemsAdded = added,
            ItemsUpdated = updated,
            TotalItems = total,
            ErrorMessage = error
        };

        db.SyncHistory.Add(history);
        await db.SaveChangesAsync();
    }

    public async Task<SyncHistory?> GetLastSyncAsync(string providerId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        return await db.SyncHistory
            .Where(s => s.ProviderId == providerId)
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefaultAsync();
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 3: Commit**

```
feat: add SyncOrchestrator for job management and progress channels
```

---

### Task 3: ItemSyncProvider

Extract sync logic from existing `ItemDatabaseSeeder` and `ItemDatabaseSyncJob` into a provider that reports progress.

**Files:**
- Create: `src/Vanalytics.Api/Services/Sync/ItemSyncProvider.cs`

- [ ] **Step 1: Create ItemSyncProvider.cs**

```csharp
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class ItemSyncProvider : ISyncProvider
{
    private const string ItemsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/items.lua";
    private const string DescriptionsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/item_descriptions.lua";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ItemSyncProvider> _logger;

    public string ProviderId => "items";
    public string DisplayName => "Item Database";

    public ItemSyncProvider(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ItemSyncProvider> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "Downloading item data from Windower Resources..."
        });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        var items = LuaResourceParser.ParseItems(itemsLua);
        var descriptions = LuaResourceParser.ParseDescriptions(descriptionsLua);

        _logger.LogInformation("Parsed {Count} items, {DescCount} descriptions", items.Count, descriptions.Count);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            if (descriptions.TryGetValue(item.ItemId, out var desc))
            {
                item.Description = desc.En;
                item.DescriptionJa = desc.Ja;
                ItemStatExtractor.ExtractStats(item, desc.En);
            }
            item.UpdatedAt = now;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var existingIds = await db.GameItems.Select(i => i.ItemId).ToHashSetAsync(ct);

        var newItems = items.Where(i => !existingIds.Contains(i.ItemId)).ToList();
        foreach (var item in newItems)
            item.CreatedAt = now;

        var updatedItems = items.Where(i => existingIds.Contains(i.ItemId)).ToList();

        var total = newItems.Count + updatedItems.Count;
        var current = 0;
        var added = 0;
        var updated = 0;

        // Insert new items in batches
        if (newItems.Count > 0)
        {
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"Inserting {newItems.Count} new items...",
                Current = current,
                Total = total
            });

            const int batchSize = 1000;
            for (int i = 0; i < newItems.Count; i += batchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = newItems.Skip(i).Take(batchSize).ToList();
                db.GameItems.AddRange(batch);
                await db.SaveChangesAsync(ct);

                added += batch.Count;
                current += batch.Count;

                var lastItem = batch[^1];
                progress.Report(new SyncProgressEvent
                {
                    ProviderId = ProviderId,
                    Type = SyncEventType.Progress,
                    CurrentItem = lastItem.Name,
                    CurrentItemId = lastItem.ItemId,
                    Current = current,
                    Total = total,
                    Added = added,
                    Updated = updated
                });
            }
        }

        // Update existing items
        if (updatedItems.Count > 0)
        {
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"Updating {updatedItems.Count} existing items...",
                Current = current,
                Total = total,
                Added = added
            });

            foreach (var item in updatedItems)
            {
                ct.ThrowIfCancellationRequested();

                var existing = await db.GameItems.FindAsync(new object[] { item.ItemId }, ct);
                if (existing is null) continue;

                existing.Name = item.Name;
                existing.NameJa = item.NameJa;
                existing.NameLong = item.NameLong;
                existing.Description = item.Description;
                existing.DescriptionJa = item.DescriptionJa;
                existing.Category = item.Category;
                existing.Type = item.Type;
                existing.Flags = item.Flags;
                existing.StackSize = item.StackSize;
                existing.Level = item.Level;
                existing.Jobs = item.Jobs;
                existing.Races = item.Races;
                existing.Slots = item.Slots;
                existing.Skill = item.Skill;
                existing.Damage = item.Damage;
                existing.Delay = item.Delay;
                existing.DEF = item.DEF;
                existing.HP = item.HP;
                existing.MP = item.MP;
                existing.STR = item.STR;
                existing.DEX = item.DEX;
                existing.VIT = item.VIT;
                existing.AGI = item.AGI;
                existing.INT = item.INT;
                existing.MND = item.MND;
                existing.CHR = item.CHR;
                existing.Accuracy = item.Accuracy;
                existing.Attack = item.Attack;
                existing.RangedAccuracy = item.RangedAccuracy;
                existing.RangedAttack = item.RangedAttack;
                existing.MagicAccuracy = item.MagicAccuracy;
                existing.MagicDamage = item.MagicDamage;
                existing.MagicEvasion = item.MagicEvasion;
                existing.Evasion = item.Evasion;
                existing.Enmity = item.Enmity;
                existing.Haste = item.Haste;
                existing.StoreTP = item.StoreTP;
                existing.TPBonus = item.TPBonus;
                existing.PhysicalDamageTaken = item.PhysicalDamageTaken;
                existing.MagicDamageTaken = item.MagicDamageTaken;
                existing.UpdatedAt = now;

                updated++;
                current++;

                if (current % 500 == 0)
                {
                    await db.SaveChangesAsync(ct);
                    progress.Report(new SyncProgressEvent
                    {
                        ProviderId = ProviderId,
                        Type = SyncEventType.Progress,
                        CurrentItem = item.Name,
                        CurrentItemId = item.ItemId,
                        Current = current,
                        Total = total,
                        Added = added,
                        Updated = updated
                    });
                }
            }

            await db.SaveChangesAsync(ct);
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Current = total,
            Total = total,
            Added = added,
            Updated = updated,
            Message = $"Sync complete: {added} added, {updated} updated"
        });

        _logger.LogInformation("Item sync complete: {Total} items ({Added} new, {Updated} updated)", total, added, updated);
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 3: Commit**

```
feat: add ItemSyncProvider with progress reporting
```

---

### Task 4: IconSyncProvider

Extract icon download logic from `ItemImageDownloader` into a provider with per-icon progress.

**Files:**
- Create: `src/Vanalytics.Api/Services/Sync/IconSyncProvider.cs`

- [ ] **Step 1: Create IconSyncProvider.cs**

```csharp
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class IconSyncProvider : ISyncProvider
{
    private const string IconUrlTemplate = "https://static.ffxiah.com/images/icon/{0}.png";
    private const int MaxConcurrentDownloads = 5;
    private static readonly TimeSpan DelayBetweenRequests = TimeSpan.FromMilliseconds(100);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IItemImageStore _imageStore;
    private readonly ILogger<IconSyncProvider> _logger;

    public string ProviderId => "icons";
    public string DisplayName => "Item Icons";

    public IconSyncProvider(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        IItemImageStore imageStore,
        ILogger<IconSyncProvider> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _imageStore = imageStore;
        _logger = logger;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "Checking for missing icons..."
        });

        List<(int ItemId, string Name)> itemsNeedingIcons;
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var allItems = await db.GameItems
                .Select(i => new { i.ItemId, i.Name })
                .ToListAsync(ct);

            itemsNeedingIcons = allItems
                .Where(i => !_imageStore.IconExists(i.ItemId))
                .Select(i => (i.ItemId, i.Name))
                .ToList();
        }

        if (itemsNeedingIcons.Count == 0)
        {
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Completed,
                Message = "All icons already downloaded",
                Skipped = 0
            });
            return;
        }

        var total = itemsNeedingIcons.Count;
        var downloaded = 0;
        var failed = 0;
        var current = 0;

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"Downloading {total} missing icons...",
            Total = total
        });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        // Process sequentially for predictable progress reporting
        foreach (var (itemId, name) in itemsNeedingIcons)
        {
            ct.ThrowIfCancellationRequested();

            await Task.Delay(DelayBetweenRequests, ct);

            var url = string.Format(IconUrlTemplate, itemId);
            try
            {
                var response = await client.GetAsync(url, ct);
                if (response.IsSuccessStatusCode)
                {
                    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                    var iconPath = await _imageStore.SaveIconAsync(itemId, bytes, ct);

                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                    await db.GameItems
                        .Where(i => i.ItemId == itemId)
                        .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, iconPath), ct);

                    downloaded++;
                }
                else
                {
                    failed++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "Failed to download icon for item {ItemId}", itemId);
                failed++;
            }

            current++;

            // Report every icon (the UI shows per-item progress)
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                CurrentItem = name,
                CurrentItemId = itemId,
                Current = current,
                Total = total,
                Added = downloaded,
                Failed = failed
            });
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Current = total,
            Total = total,
            Added = downloaded,
            Failed = failed,
            Message = $"Icon sync complete: {downloaded} downloaded, {failed} failed"
        });

        _logger.LogInformation("Icon sync complete: {Downloaded} downloaded, {Failed} failed out of {Total}",
            downloaded, failed, total);
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 3: Commit**

```
feat: add IconSyncProvider with per-icon progress reporting
```

---

### Task 5: AdminSyncController — API endpoints with SSE

**Files:**
- Create: `src/Vanalytics.Api/Controllers/AdminSyncController.cs`

- [ ] **Step 1: Create AdminSyncController.cs**

```csharp
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vanalytics.Api.Services.Sync;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/sync")]
[Authorize(Roles = "Admin")]
public class AdminSyncController : ControllerBase
{
    private readonly SyncOrchestrator _orchestrator;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public AdminSyncController(SyncOrchestrator orchestrator)
    {
        _orchestrator = orchestrator;
    }

    [HttpPost("{providerId}/start")]
    public IActionResult Start(string providerId)
    {
        if (_orchestrator.IsRunning(providerId))
            return Conflict(new { message = $"Sync for '{providerId}' is already running." });

        if (!_orchestrator.TryStart(providerId, out _))
            return NotFound(new { message = $"Unknown sync provider: '{providerId}'." });

        return Ok(new { message = $"Sync started for '{providerId}'." });
    }

    [HttpPost("{providerId}/cancel")]
    public IActionResult Cancel(string providerId)
    {
        if (!_orchestrator.TryCancel(providerId))
            return NotFound(new { message = $"No running sync for '{providerId}'." });

        return Ok(new { message = $"Cancellation requested for '{providerId}'." });
    }

    [HttpGet("{providerId}/progress")]
    public async Task Progress(string providerId, CancellationToken ct)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        var job = _orchestrator.GetJob(providerId);
        if (job is null)
        {
            // No active job — send a single status event and close
            var lastSync = await _orchestrator.GetLastSyncAsync(providerId);
            var statusEvent = new SyncProgressEvent
            {
                ProviderId = providerId,
                Type = SyncEventType.Completed,
                Message = lastSync is not null
                    ? $"Last sync: {lastSync.Status} at {lastSync.CompletedAt:u}"
                    : "No sync history"
            };

            await WriteEventAsync(statusEvent, ct);
            return;
        }

        var reader = job.Channel.Reader;

        try
        {
            await foreach (var evt in reader.ReadAllAsync(ct))
            {
                await WriteEventAsync(evt, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // Client disconnected
        }
    }

    // Known provider IDs — add new providers here as they're created
    private static readonly string[] ProviderIds = ["items", "icons"];

    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var providerList = new List<object>();
        foreach (var pid in ProviderIds)
        {
            var isRunning = _orchestrator.IsRunning(pid);
            var lastSync = await _orchestrator.GetLastSyncAsync(pid);
            var provider = HttpContext.RequestServices.GetKeyedService<ISyncProvider>(pid);

            providerList.Add(new
            {
                providerId = pid,
                displayName = provider?.DisplayName ?? pid,
                isRunning,
                lastSync = lastSync is null ? null : new
                {
                    startedAt = lastSync.StartedAt,
                    completedAt = lastSync.CompletedAt,
                    status = lastSync.Status,
                    itemsAdded = lastSync.ItemsAdded,
                    itemsUpdated = lastSync.ItemsUpdated,
                    itemsSkipped = lastSync.ItemsSkipped,
                    itemsFailed = lastSync.ItemsFailed,
                    totalItems = lastSync.TotalItems,
                    errorMessage = lastSync.ErrorMessage
                }
            });
        }

        return Ok(providerList);
    }

    private async Task WriteEventAsync(SyncProgressEvent evt, CancellationToken ct)
    {
        var eventType = evt.Type.ToString().ToLowerInvariant();
        var json = JsonSerializer.Serialize(evt, JsonOptions);
        await Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n", ct);
        await Response.Body.FlushAsync(ct);
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 3: Commit**

```
feat: add AdminSyncController with SSE progress streaming
```

---

### Task 6: Wire up DI and clean up Program.cs

Register the sync providers and orchestrator. Remove startup seeding and ItemImageDownloader.

**Files:**
- Modify: `src/Vanalytics.Api/Program.cs`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Update Program.cs**

1. Add sync service registrations after the existing service registrations:
```csharp
// Sync providers (admin-triggered)
builder.Services.AddSingleton<SyncOrchestrator>();
builder.Services.AddKeyedSingleton<ISyncProvider, ItemSyncProvider>("items");
builder.Services.AddKeyedSingleton<ISyncProvider, IconSyncProvider>("icons");
```

Add `using Vanalytics.Api.Services.Sync;` at the top.

2. Remove `builder.Services.AddHostedService<ItemImageDownloader>();` line.

3. Remove the startup seeding block:
```csharp
// DELETE this entire block:
    // Seed item database (skip in integration tests via config)
    if (!string.Equals(app.Configuration["SKIP_ITEM_SEED"], "true", StringComparison.OrdinalIgnoreCase))
    {
        var httpFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
        await ItemDatabaseSeeder.SeedAsync(db, httpFactory, logger);
    }
```

- [ ] **Step 2: Update deploy.yml**

Remove the `SKIP_ITEM_SEED=true \` line from the deploy step env vars.

- [ ] **Step 3: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 4: Commit**

```
refactor: wire up sync DI, remove startup seeding and ItemImageDownloader
```

---

### Task 7: Refactor ItemDatabaseSyncJob to use ItemSyncProvider

The 24h background job should delegate to `ItemSyncProvider` instead of duplicating logic, and record sync history.

**Files:**
- Modify: `src/Vanalytics.Api/Services/ItemDatabaseSyncJob.cs`

- [ ] **Step 1: Rewrite ItemDatabaseSyncJob**

```csharp
using Vanalytics.Api.Services.Sync;

namespace Vanalytics.Api.Services;

public class ItemDatabaseSyncJob : BackgroundService
{
    private readonly SyncOrchestrator _orchestrator;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ItemDatabaseSyncJob> _logger;
    private static readonly TimeSpan SyncInterval = TimeSpan.FromHours(24);

    public ItemDatabaseSyncJob(
        SyncOrchestrator orchestrator,
        IServiceProvider serviceProvider,
        ILogger<ItemDatabaseSyncJob> logger)
    {
        _orchestrator = orchestrator;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait 2 minutes after startup before first sync
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Skip if an admin-triggered sync is already running
                if (!_orchestrator.IsRunning("items"))
                {
                    await RunBackgroundSyncAsync(stoppingToken);
                }
                else
                {
                    _logger.LogDebug("Skipping background sync — admin sync already running");
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Background item sync failed");
            }

            await Task.Delay(SyncInterval, stoppingToken);
        }
    }

    private async Task RunBackgroundSyncAsync(CancellationToken ct)
    {
        var provider = _serviceProvider.GetKeyedService<ISyncProvider>("items");
        if (provider is null)
        {
            _logger.LogWarning("ItemSyncProvider not found");
            return;
        }

        var added = 0;
        var updated = 0;
        var total = 0;

        var progress = new Progress<SyncProgressEvent>(evt =>
        {
            added = evt.Added;
            updated = evt.Updated;
            total = evt.Total;
        });

        try
        {
            await provider.SyncAsync(progress, ct);
            await _orchestrator.RecordBackgroundSyncAsync("items", added, updated, total);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await _orchestrator.RecordBackgroundSyncAsync("items", added, updated, total, ex.Message);
            throw;
        }
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`

- [ ] **Step 3: Commit**

```
refactor: ItemDatabaseSyncJob delegates to ItemSyncProvider with history recording
```

---

### Task 8: Delete replaced files

**Files:**
- Delete: `src/Vanalytics.Api/Services/ItemDatabaseSeeder.cs`
- Delete: `src/Vanalytics.Api/Services/ItemImageDownloader.cs`

- [ ] **Step 1: Delete both files**

- [ ] **Step 2: Build to verify no remaining references**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj`
Expected: Build succeeded (all references to these classes have been removed in previous tasks).

- [ ] **Step 3: Commit**

```
refactor: delete ItemDatabaseSeeder and ItemImageDownloader (replaced by sync providers)
```

---

### Task 9: Frontend — sync controls on AdminItemsPage

Add the "Data Synchronization" section with per-provider sync cards, SSE progress streaming, and cancel support.

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/AdminItemsPage.tsx`

- [ ] **Step 1: Rewrite AdminItemsPage.tsx**

Add the sync controls section above the existing stats. The page needs:

1. **On mount:** Fetch `/api/admin/sync/status` to get all providers + last sync info
2. **"Sync Now" button:** POST to `/api/admin/sync/{providerId}/start`, then open SSE stream via `fetch()` to `/api/admin/sync/{providerId}/progress`
3. **SSE handler:** Parse the `ReadableStream` text line-by-line, extract `event:` and `data:` lines, update progress state on each event
4. **"Cancel" button:** POST to `/api/admin/sync/{providerId}/cancel`
5. **Completed state:** Show summary, close the reader
6. **Error recovery:** If fetch errors or stream closes unexpectedly, fall back to polling `/api/admin/sync/status` every 5s

Key types for the frontend:

```typescript
interface SyncProviderStatus {
  providerId: string
  displayName: string
  isRunning: boolean
  lastSync: {
    startedAt: string
    completedAt: string | null
    status: string
    itemsAdded: number
    itemsUpdated: number
    itemsSkipped: number
    itemsFailed: number
    totalItems: number
    errorMessage: string | null
  } | null
}

interface SyncProgress {
  providerId: string
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled'
  message?: string
  currentItem?: string
  currentItemId?: number
  current: number
  total: number
  added: number
  updated: number
  skipped: number
  failed: number
}
```

The `SyncCard` component handles a single provider:
- Idle: shows display name, last sync time, "Sync Now" button
- Running: shows progress bar, current item, counters, "Cancel" button
- Completed: shows summary until next page load

The sync section renders a `SyncCard` for each provider returned by `/api/admin/sync/status`.

**IMPORTANT: Do NOT use `EventSource`.** The native `EventSource` API cannot set Authorization headers, and this app uses JWT Bearer tokens. Instead, use `fetch()` with the existing `api` helper (which adds the Bearer token) and parse the SSE stream via `ReadableStream`:

```typescript
// Use the app's existing authenticated fetch, then read the SSE stream
const response = await fetch(`/api/admin/sync/${providerId}/progress`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  // Parse SSE lines: "event: type\ndata: json\n\n"
  const lines = buffer.split('\n\n')
  buffer = lines.pop()! // keep incomplete chunk
  for (const block of lines) {
    const eventMatch = block.match(/^event: (.+)$/m)
    const dataMatch = block.match(/^data: (.+)$/m)
    if (dataMatch) {
      const evt: SyncProgress = JSON.parse(dataMatch[1])
      // Update state based on evt.type
    }
  }
}
```

Get the token from the app's existing auth mechanism (check how `api/client.ts` stores/retrieves it).

The existing stats section (`StatCard`, categories table, economy data) stays unchanged below the sync controls.

See the mockup at `.superpowers/brainstorm/7038-1774118428/admin-sync-ui.html` for the visual design. Match the existing page's styling (gray-800/900 borders, gray-200/400/500 text, blue-600 accents).

- [ ] **Step 2: Build frontend**

Run: `cd "C:/Git/soverance/Vanalytics/src/Vanalytics.Web" && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```
feat: add sync controls with SSE progress to AdminItemsPage
```

---

### Task 10: Final build verification

- [ ] **Step 1: Clean build of entire solution**

Run: `cd "C:/Git/soverance/Vanalytics" && dotnet build --no-incremental`
Expected: Build succeeded, 0 errors.

- [ ] **Step 2: Frontend build**

Run: `cd "C:/Git/soverance/Vanalytics/src/Vanalytics.Web" && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Verify deleted files are gone**

Confirm these no longer exist:
- `src/Vanalytics.Api/Services/ItemDatabaseSeeder.cs`
- `src/Vanalytics.Api/Services/ItemImageDownloader.cs`

- [ ] **Step 4: Note for Scott — EF Migration needed**

After all code changes are committed, scaffold the migration:
```bash
cd src/Vanalytics.Api
dotnet ef migrations add SyncHistory --project ../Vanalytics.Data
```

This adds the `SyncHistory` table. Should be auto-scaffoldable.
