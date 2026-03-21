namespace Vanalytics.Api.Services;

public class LocalItemImageStore : IItemImageStore
{
    private readonly string _basePath;

    public LocalItemImageStore(IConfiguration config)
    {
        _basePath = config["ItemImages:BasePath"] ?? Path.Combine(AppContext.BaseDirectory, "item-images");
        Directory.CreateDirectory(Path.Combine(_basePath, "icons"));
    }

    public async Task<string> SaveIconAsync(int itemId, byte[] data, CancellationToken ct = default)
    {
        var filePath = Path.Combine(_basePath, "icons", $"{itemId}.png");
        await File.WriteAllBytesAsync(filePath, data, ct);
        return $"icons/{itemId}.png";
    }

    public bool IconExists(int itemId)
    {
        return File.Exists(Path.Combine(_basePath, "icons", $"{itemId}.png"));
    }

    public string GetIconUrl(int itemId)
    {
        return $"/item-images/icons/{itemId}.png";
    }
}
