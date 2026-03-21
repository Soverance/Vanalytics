# Admin-Triggered Resource Sync System

**Date:** 2026-03-21
**Status:** Draft
**Goal:** Replace startup-blocking data seeding with an admin-triggered sync system that provides real-time progress tracking via SSE, supports cancellation, and is generic enough to add new resource types without changing the framework.

## Context

Vanalytics seeds ~30K FFXI game items from Windower Resources on startup. This blocks the app from starting for minutes, causing Cloudflare 524 timeouts in production. Item icon downloads (~30K images from ffxiah.com) also run as an automatic background service.

This design decouples data seeding from app startup entirely, making it an admin-triggered action with real-time progress visibility.

## Design

### Provider Interface

Each syncable resource type implements `ISyncProvider`:

```csharp
public interface ISyncProvider
{
    string ProviderId { get; }        // e.g., "items", "icons"
    string DisplayName { get; }       // e.g., "Item Database", "Item Icons"
    Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct);
}
```

Providers are registered in DI and discovered by the orchestrator. Adding a new resource type means implementing this interface and registering it — no framework changes needed.

### Progress Events

All providers report progress through a shared event model:

```csharp
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

public enum SyncEventType { Started, Progress, Completed, Failed, Cancelled }
```

### SyncOrchestrator

Singleton service that manages sync lifecycle:

- Maintains a `ConcurrentDictionary<string, SyncJob>` of active jobs
- Each `SyncJob` holds: `CancellationTokenSource`, `Channel<SyncProgressEvent>`, start time, provider ID
- `StartSync(providerId)` — resolves the provider from DI, starts it on a background task, returns the job ID. Returns 409 if that provider is already running.
- `CancelSync(providerId)` — triggers the CancellationToken
- `GetProgressChannel(providerId)` — returns the Channel reader for SSE streaming
- `GetStatus()` — returns current state of all providers (idle/running, last sync result/timestamp)

Sync state (last sync time, last result) is stored in a `SyncHistory` database table so it survives app restarts.

### SyncHistory Table

```
SyncHistory
├── Id (int, PK, identity)
├── ProviderId (string, required)
├── StartedAt (DateTimeOffset)
├── CompletedAt (DateTimeOffset, nullable)
├── Status (string: "Completed", "Failed", "Cancelled")
├── ItemsAdded (int)
├── ItemsUpdated (int)
├── ItemsSkipped (int)
├── ItemsFailed (int)
├── TotalItems (int)
├── ErrorMessage (string, nullable)
```

### API Endpoints

All require Admin role authorization.

```
POST /api/admin/sync/{providerId}/start    — Start a sync job. Returns 200 or 409 if running.
POST /api/admin/sync/{providerId}/cancel   — Cancel a running sync job.
GET  /api/admin/sync/{providerId}/progress — SSE stream of SyncProgressEvent.
GET  /api/admin/sync/status                — All providers: id, displayName, isRunning, lastSync.
```

The SSE endpoint uses `IAsyncEnumerable<SyncProgressEvent>` with `[Produces("text/event-stream")]`. The channel is read in a loop, yielding events until the sync completes or the client disconnects. Events are serialized as JSON in the SSE `data:` field with the event type as the SSE `event:` field.

SSE format:
```
event: progress
data: {"providerId":"icons","type":"Progress","currentItem":"Vermin Cutter","currentItemId":16777,"current":10242,"total":30124,"added":10180,"skipped":52,"failed":10}

event: completed
data: {"providerId":"icons","type":"Completed","current":30124,"total":30124,"added":29900,"skipped":200,"failed":24}
```

### Initial Providers

**ItemSyncProvider** (`providerId: "items"`):
- Downloads items.lua and item_descriptions.lua from Windower Resources GitHub
- Parses with existing `LuaResourceParser`
- Compares against existing DB items by ItemId
- Inserts new items, updates changed items (same logic as current `ItemDatabaseSyncJob`)
- Reports progress per batch (1000 items per batch during insert, per-item during update)
- Extracts stats with existing `ItemStatExtractor`

**IconSyncProvider** (`providerId: "icons"`):
- Queries DB for items missing icons (IconPath is null or icon doesn't exist in store)
- Downloads from ffxiah.com with rate limiting (5 concurrent, 100ms delay)
- Saves via `IItemImageStore` (local or Azure Blob depending on config)
- Updates `GameItems.IconPath` in DB
- Reports progress per icon with the item name

### What Gets Removed

- `ItemDatabaseSeeder` class — deleted entirely
- `ItemImageDownloader` background service — replaced by `IconSyncProvider`
- Startup seeding block in `Program.cs` (the `ItemDatabaseSeeder.SeedAsync()` call and `SKIP_ITEM_SEED` check)
- `SKIP_ITEM_SEED` env var from deploy.yml

### What Stays (Modified)

- `ItemDatabaseSyncJob` (24h background service) — refactored to use `ItemSyncProvider` internally instead of duplicating sync logic. Still runs on its 24h timer for automatic maintenance. Does not report progress via SSE (no listener for background runs), but writes a `SyncHistory` record on completion so the admin dashboard shows when the last automatic sync occurred.

### Frontend Changes

The existing `AdminItemsPage.tsx` gets a new "Data Synchronization" section above the stats dashboard:

**Per-provider sync card showing:**
- Provider display name
- Status: idle (with last sync timestamp + item count) or running (with progress)
- "Sync Now" button (idle) / "Cancel" button (running)
- Progress bar with percentage when running
- Current item name + ID being processed
- Running counters: added / skipped / failed
- Completed summary when done (persists until next sync or page refresh)

**SSE connection:** When a sync starts, the frontend opens an `EventSource` to the progress endpoint. Events update the progress state in real-time. The connection closes automatically when the sync completes or is cancelled.

**Mid-sync page load:** If the admin navigates to the page while a sync is already running, the `/status` endpoint returns `isRunning: true` with the provider ID. The frontend then opens an SSE connection to pick up live progress. The SSE channel replays no history — the UI shows "Syncing..." with the running state from status and updates from the next event onward. This is acceptable since the progress counters in each event are absolute (not incremental), so a single event brings the UI fully up to date.

**Error handling:** If the SSE connection drops, the UI falls back to polling `/api/admin/sync/status` every 5 seconds to recover state. A "connection lost, reconnecting..." indicator shows briefly.

### Error Handling & Robustness

- **Provider isolation:** One provider failing doesn't affect others. Errors are caught per-provider and recorded in SyncHistory.
- **Cancellation:** CancellationToken propagates through all async operations. Partial progress is preserved (items already inserted stay inserted).
- **Duplicate prevention:** Only one instance of each provider can run at a time. The orchestrator rejects concurrent starts with 409.
- **Rate limiting:** Icon downloads use SemaphoreSlim (5 concurrent) + delay (100ms) to avoid hammering external services.
- **Timeout:** Individual HTTP requests to external services have 30s timeout. The overall sync has no timeout — it runs to completion or cancellation.
- **App restart during sync:** Running syncs are lost on restart (they're in-memory). SyncHistory records the start but no completion. The admin can re-trigger. Partial data is fine — the next sync picks up where it left off (upsert logic).

## Files Changed Summary

### New files
- `Services/Sync/ISyncProvider.cs` — interface + event types
- `Services/Sync/SyncOrchestrator.cs` — job management + progress channels
- `Services/Sync/ItemSyncProvider.cs` — item database sync logic
- `Services/Sync/IconSyncProvider.cs` — icon download sync logic
- `Controllers/AdminSyncController.cs` — API endpoints
- `Vanalytics.Core/Models/SyncHistory.cs` — entity model
- `Vanalytics.Data/Configurations/SyncHistoryConfiguration.cs` — EF config
- EF migration for SyncHistory table

### Modified files
- `Program.cs` — remove startup seeding, remove `ItemImageDownloader` registration
- `ItemDatabaseSyncJob.cs` — refactor to use `ItemSyncProvider` internally
- `AdminItemsPage.tsx` — add sync controls section with SSE progress
- `VanalyticsDbContext.cs` — add `SyncHistory` DbSet
- `deploy.yml` — remove `SKIP_ITEM_SEED` env var

### Deleted files
- `Services/ItemDatabaseSeeder.cs`
- `Services/ItemImageDownloader.cs`

## What This Does NOT Change

- Item search/browse API endpoints
- Economy data ingestion (AH sales, bazaar)
- Server status scraping
- The existing 24h background sync schedule (just refactored internally)
- Authentication or authorization model
