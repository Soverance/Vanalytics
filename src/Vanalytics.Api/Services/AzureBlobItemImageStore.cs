using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Vanalytics.Api.Services;

public class AzureBlobItemImageStore : IItemImageStore
{
    private readonly BlobContainerClient _container;
    private readonly ILogger<AzureBlobItemImageStore> _logger;
    private bool _containerEnsured;

    public AzureBlobItemImageStore(IConfiguration config, ILogger<AzureBlobItemImageStore> logger)
    {
        var connectionString = config["AzureStorage:ConnectionString"]!;
        var containerName = config["AzureStorage:ItemImagesContainer"] ?? "item-images";

        var blobServiceClient = new BlobServiceClient(connectionString);
        _container = blobServiceClient.GetBlobContainerClient(containerName);
        _logger = logger;
    }

    public string BaseUrl => _container.Uri.ToString().TrimEnd('/');

    private async Task EnsureContainerAsync(CancellationToken ct = default)
    {
        if (_containerEnsured) return;
        try
        {
            await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);
            _containerEnsured = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to ensure blob container exists");
        }
    }

    public async Task<string> SaveIconAsync(int itemId, byte[] data, CancellationToken ct = default)
    {
        await EnsureContainerAsync(ct);
        var blobName = $"icons/{itemId}.png";
        var blob = _container.GetBlobClient(blobName);
        using var stream = new MemoryStream(data);
        await blob.UploadAsync(stream, new BlobHttpHeaders { ContentType = "image/png" }, cancellationToken: ct);
        return blobName;
    }

    public bool IconExists(int itemId)
    {
        var blob = _container.GetBlobClient($"icons/{itemId}.png");
        try { return blob.Exists(); }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to check blob existence for item {ItemId}", itemId);
            return false;
        }
    }

    public string GetIconUrl(int itemId) => $"{BaseUrl}/icons/{itemId}.png";

    public async Task<HashSet<int>> GetExistingIconIdsAsync(IEnumerable<int> itemIds, CancellationToken ct = default)
    {
        await EnsureContainerAsync(ct);
        var existingIds = new HashSet<int>();
        await foreach (var blob in _container.GetBlobsAsync(prefix: "icons/", cancellationToken: ct))
        {
            var fileName = Path.GetFileNameWithoutExtension(blob.Name);
            if (int.TryParse(fileName, out var id))
                existingIds.Add(id);
        }
        var requested = new HashSet<int>(itemIds);
        existingIds.IntersectWith(requested);
        return existingIds;
    }
}
