using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class ItemImageDownloader : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ItemImageDownloader> _logger;
    private readonly IItemImageStore _imageStore;

    private const string IconUrlTemplate = "https://static.ffxiah.com/images/icon/{0}.png";
    private const int MaxConcurrentDownloads = 5;
    private static readonly TimeSpan DelayBetweenRequests = TimeSpan.FromMilliseconds(100);

    public ItemImageDownloader(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ItemImageDownloader> logger,
        IItemImageStore imageStore)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _imageStore = imageStore;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait for seeding to complete
        while (!stoppingToken.IsCancellationRequested)
        {
            using var checkScope = _scopeFactory.CreateScope();
            var checkDb = checkScope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            if (await checkDb.GameItems.AnyAsync(stoppingToken))
                break;
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }

        await DownloadMissingIconsAsync(stoppingToken);
    }

    private async Task DownloadMissingIconsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var allItems = await db.GameItems
            .Select(i => i.ItemId)
            .ToListAsync(ct);

        // Check which icons actually exist in the store (local disk or blob)
        var itemsNeedingIcons = allItems
            .Where(id => !_imageStore.IconExists(id))
            .ToList();

        if (itemsNeedingIcons.Count == 0)
        {
            _logger.LogInformation("All item icons already downloaded");
            return;
        }

        _logger.LogInformation("Downloading icons for {Count} items", itemsNeedingIcons.Count);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        var semaphore = new SemaphoreSlim(MaxConcurrentDownloads);
        var downloaded = 0;
        var failed = 0;

        var tasks = itemsNeedingIcons.Select(async itemId =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                await Task.Delay(DelayBetweenRequests, ct);

                var url = string.Format(IconUrlTemplate, itemId);

                try
                {
                    var response = await client.GetAsync(url, ct);
                    if (response.IsSuccessStatusCode)
                    {
                        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                        var iconPath = await _imageStore.SaveIconAsync(itemId, bytes, ct);

                        using var updateScope = _scopeFactory.CreateScope();
                        var updateDb = updateScope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                        await updateDb.GameItems
                            .Where(i => i.ItemId == itemId)
                            .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, iconPath), ct);

                        Interlocked.Increment(ref downloaded);
                    }
                    else
                    {
                        Interlocked.Increment(ref failed);
                    }
                }
                catch
                {
                    Interlocked.Increment(ref failed);
                }
            }
            finally
            {
                semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);
        _logger.LogInformation("Icon download complete: {Downloaded} succeeded, {Failed} failed", downloaded, failed);
    }
}
