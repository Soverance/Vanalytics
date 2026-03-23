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

    public bool IconExists(int itemId) =>
        File.Exists(Path.Combine(_basePath, "icons", $"{itemId}.png"));

    public string GetIconUrl(int itemId) =>
        $"/item-images/icons/{itemId}.png";

    public Task<HashSet<int>> GetExistingIconIdsAsync(IEnumerable<int> itemIds, CancellationToken ct = default)
    {
        var existing = new HashSet<int>();
        foreach (var id in itemIds)
        {
            ct.ThrowIfCancellationRequested();
            if (File.Exists(Path.Combine(_basePath, "icons", $"{id}.png")))
                existing.Add(id);
        }
        return Task.FromResult(existing);
    }
}
