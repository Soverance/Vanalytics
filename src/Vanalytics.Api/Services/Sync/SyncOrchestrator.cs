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
            return false;
        }

        job = newJob;

        _ = Task.Run(async () =>
        {
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
                    record.ItemsAdded = lastEvent.Added;
                    record.ItemsUpdated = lastEvent.Updated;
                    record.ItemsFailed = lastEvent.Failed;
                    record.TotalItems = lastEvent.Total;
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
