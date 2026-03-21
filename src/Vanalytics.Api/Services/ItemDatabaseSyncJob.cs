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
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
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
