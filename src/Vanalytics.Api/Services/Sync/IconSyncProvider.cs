using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class IconSyncProvider : ISyncProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IItemImageStore _imageStore;
    private readonly ILogger<IconSyncProvider> _logger;

    private const string IconUrlTemplate = "https://static.ffxiah.com/images/icon/{0}.png";
    private static readonly TimeSpan DelayBetweenRequests = TimeSpan.FromMilliseconds(100);

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
            Message = "Querying items that need icons..."
        });

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var allItems = await db.GameItems
            .Select(i => new { i.ItemId, i.Name })
            .ToListAsync(ct);

        var itemsNeedingIcons = allItems
            .Where(i => !_imageStore.IconExists(i.ItemId))
            .ToList();

        var total = itemsNeedingIcons.Count;

        if (total == 0)
        {
            _logger.LogInformation("All item icons are already present");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Completed,
                Message = "All icons already present. Nothing to do.",
                Current = 0,
                Total = 0,
                Skipped = allItems.Count
            });
            return;
        }

        _logger.LogInformation("Downloading icons for {Count} items", total);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        var downloaded = 0;
        var failed = 0;

        foreach (var item in itemsNeedingIcons)
        {
            ct.ThrowIfCancellationRequested();

            await Task.Delay(DelayBetweenRequests, ct);

            var url = string.Format(IconUrlTemplate, item.ItemId);

            try
            {
                var response = await client.GetAsync(url, ct);
                if (response.IsSuccessStatusCode)
                {
                    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                    var iconPath = await _imageStore.SaveIconAsync(item.ItemId, bytes, ct);

                    await db.GameItems
                        .Where(i => i.ItemId == item.ItemId)
                        .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, iconPath), ct);

                    downloaded++;
                }
                else
                {
                    _logger.LogWarning("Icon download returned {Status} for item {ItemId}", response.StatusCode, item.ItemId);
                    failed++;
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to download icon for item {ItemId}", item.ItemId);
                failed++;
            }

            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"Downloaded icon for {item.Name}",
                CurrentItem = item.Name,
                CurrentItemId = item.ItemId,
                Current = downloaded + failed,
                Total = total,
                Added = downloaded,
                Failed = failed
            });
        }

        _logger.LogInformation("Icon sync complete: {Downloaded} downloaded, {Failed} failed", downloaded, failed);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Icon sync complete: {downloaded} downloaded, {failed} failed.",
            Current = total,
            Total = total,
            Added = downloaded,
            Failed = failed
        });
    }
}
