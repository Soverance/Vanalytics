using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Soverance.Auth.Services;

namespace Vanalytics.Api.Services;

public class AzureBlobAvatarStore : IAvatarStore
{
    private readonly BlobContainerClient _container;
    private readonly ILogger<AzureBlobAvatarStore> _logger;
    private bool _containerEnsured;

    public AzureBlobAvatarStore(IConfiguration config, ILogger<AzureBlobAvatarStore> logger)
    {
        var connectionString = config["AzureStorage:ConnectionString"]!;
        var containerName = config["AzureStorage:AvatarContainer"] ?? "avatars";

        var blobServiceClient = new BlobServiceClient(connectionString);
        _container = blobServiceClient.GetBlobContainerClient(containerName);
        _logger = logger;
    }

    private async Task EnsureContainerAsync()
    {
        if (_containerEnsured) return;
        try
        {
            await _container.CreateIfNotExistsAsync(PublicAccessType.Blob);
            _containerEnsured = true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to ensure avatar blob container exists");
        }
    }

    public async Task<string> SaveAvatarAsync(Guid userId, byte[] imageData, string contentType)
    {
        await EnsureContainerAsync();
        var extension = contentType == "image/png" ? ".png" : ".jpg";
        var blobName = $"{userId}{extension}";
        var blob = _container.GetBlobClient(blobName);
        using var stream = new MemoryStream(imageData);
        await blob.UploadAsync(stream, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } });
        return blob.Uri.ToString();
    }
}
