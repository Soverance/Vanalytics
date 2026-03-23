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
    private const int ConcurrentDownloads = 10;
    private const int DbBatchSize = 100;

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
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        await SyncIconsAsync(db, progress, ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = "Icon sync complete."
        });
    }

    // ─── Icons (FFXIAH) ─────────────────────────────────────────────────────────

    private async Task SyncIconsAsync(
        VanalyticsDbContext db, IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "Checking which items need icons..."
        });

        var allItems = await db.GameItems
            .Select(i => new { i.ItemId, i.Name, i.IconPath })
            .ToListAsync(ct);

        var allItemIds = allItems.Select(i => i.ItemId).ToList();
        var existingInStorage = await _imageStore.GetExistingIconIdsAsync(allItemIds, ct);

        // Clear orphaned DB paths
        var orphaned = allItems
            .Where(i => i.IconPath != null && !existingInStorage.Contains(i.ItemId))
            .Select(i => i.ItemId)
            .ToHashSet();

        if (orphaned.Count > 0)
        {
            _logger.LogInformation("Clearing {Count} orphaned icon paths", orphaned.Count);
            await db.GameItems
                .Where(i => orphaned.Contains(i.ItemId))
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, (string?)null), ct);
        }

        var needingIcons = allItems
            .Where(i => !existingInStorage.Contains(i.ItemId))
            .ToList();

        if (needingIcons.Count == 0)
        {
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"All {allItems.Count} icons present. Skipping icon phase."
            });
            return;
        }

        _logger.LogInformation("Downloading icons for {Count} items", needingIcons.Count);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        var downloaded = 0;
        var failed = 0;
        var total = needingIcons.Count;
        var semaphore = new SemaphoreSlim(ConcurrentDownloads);

        for (var batchStart = 0; batchStart < needingIcons.Count; batchStart += DbBatchSize)
        {
            ct.ThrowIfCancellationRequested();
            var batch = needingIcons.Skip(batchStart).Take(DbBatchSize).ToList();
            var batchResults = new List<(int ItemId, string IconPath)>();
            var batchFailed = 0;

            var tasks = batch.Select(async item =>
            {
                await semaphore.WaitAsync(ct);
                try
                {
                    var url = string.Format(IconUrlTemplate, item.ItemId);
                    var response = await client.GetAsync(url, ct);
                    if (response.IsSuccessStatusCode)
                    {
                        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                        var iconPath = await _imageStore.SaveIconAsync(item.ItemId, bytes, ct);
                        lock (batchResults) batchResults.Add((item.ItemId, iconPath));
                    }
                    else
                    {
                        Interlocked.Increment(ref batchFailed);
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch { Interlocked.Increment(ref batchFailed); }
                finally { semaphore.Release(); }
            });

            await Task.WhenAll(tasks);

            foreach (var r in batchResults)
            {
                await db.GameItems
                    .Where(i => i.ItemId == r.ItemId)
                    .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, r.IconPath), ct);
            }

            downloaded += batchResults.Count;
            failed += batchFailed;

            var last = batch.Last();
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"Icons: {downloaded}/{total} downloaded ({failed} failed)",
                CurrentItem = last.Name,
                CurrentItemId = last.ItemId,
                Current = downloaded + failed,
                Total = total,
                Added = downloaded,
                Failed = failed
            });
        }

        _logger.LogInformation("Icon sync: {Downloaded} downloaded, {Failed} failed", downloaded, failed);
    }

}
