namespace Vanalytics.Api.Services;

public interface IItemImageStore
{
    Task<string> SaveIconAsync(int itemId, byte[] data, CancellationToken ct = default);
    bool IconExists(int itemId);
    string GetIconUrl(int itemId);
    Task<HashSet<int>> GetExistingIconIdsAsync(IEnumerable<int> itemIds, CancellationToken ct = default);
}
