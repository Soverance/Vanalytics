using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vanalytics.Api.Services;
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

    // Known provider IDs — add new providers here as they're created
    private static readonly string[] ProviderIds = ["items", "icons"];

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

        // Send the last known progress immediately so late-connecting clients see current state
        if (job.LastEvent is not null)
        {
            await WriteEventAsync(job.LastEvent, ct);
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

    /// <summary>Public endpoint — returns whether any sync is currently running. No auth required.</summary>
    [HttpGet("/api/sync/active")]
    [AllowAnonymous]
    public IActionResult IsActive()
    {
        var running = ProviderIds.Any(pid => _orchestrator.IsRunning(pid));
        return Ok(new { syncing = running });
    }

    /// <summary>Returns the last progress event for a running sync. Used for polling when reconnecting mid-sync.</summary>
    [HttpGet("{providerId}/current")]
    public IActionResult CurrentProgress(string providerId)
    {
        var job = _orchestrator.GetJob(providerId);
        if (job?.LastEvent is null)
            return NotFound();

        return new JsonResult(job.LastEvent, JsonOptions);
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var providerList = new List<object>();
        foreach (var pid in ProviderIds)
        {
            var isRunning = _orchestrator.IsRunning(pid);
            var lastSync = await _orchestrator.GetLastSyncAsync(pid);
            var provider = HttpContext.RequestServices.GetKeyedService<ISyncProvider>(pid);

            // For icons provider, include storage destination info
            object? metadata = null;
            if (pid == "icons")
            {
                var imageStore = HttpContext.RequestServices.GetService<IItemImageStore>();
                metadata = imageStore switch
                {
                    AzureBlobItemImageStore => new { storageType = "azure", label = "Azure Blob Storage" },
                    LocalItemImageStore => new { storageType = "local", label = "Local Disk" },
                    _ => new { storageType = "unknown", label = "Unknown" }
                };
            }

            providerList.Add(new
            {
                providerId = pid,
                displayName = provider?.DisplayName ?? pid,
                isRunning,
                metadata,
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
