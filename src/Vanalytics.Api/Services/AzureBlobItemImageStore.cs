using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Vanalytics.Api.Services;

public class AzureBlobItemImageStore : IItemImageStore
{
    private readonly BlobContainerClient _container;
    private readonly string _baseUrl;

    public AzureBlobItemImageStore(IConfiguration config)
    {
        var connectionString = config["AzureStorage:ConnectionString"]!;
        var containerName = config["AzureStorage:ItemImagesContainer"] ?? "item-images";

        var blobServiceClient = new BlobServiceClient(connectionString);
        _container = blobServiceClient.GetBlobContainerClient(containerName);
        _container.CreateIfNotExists(PublicAccessType.Blob);

        _baseUrl = _container.Uri.ToString().TrimEnd('/');
    }

    public async Task<string> SaveIconAsync(int itemId, byte[] data, CancellationToken ct = default)
    {
        var blobName = $"icons/{itemId}.png";
        var blob = _container.GetBlobClient(blobName);

        using var stream = new MemoryStream(data);
        await blob.UploadAsync(stream, new BlobHttpHeaders { ContentType = "image/png" }, cancellationToken: ct);

        return $"{_baseUrl}/{blobName}";
    }

    public bool IconExists(int itemId)
    {
        var blob = _container.GetBlobClient($"icons/{itemId}.png");
        return blob.Exists();
    }

    public string GetIconUrl(int itemId)
    {
        return $"{_baseUrl}/icons/{itemId}.png";
    }
}
