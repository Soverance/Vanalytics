namespace Vanalytics.Api.DTOs;

public class ItemOwnerEntry
{
    public required string Name { get; init; }
    public required string Server { get; init; }
    public string? Job { get; init; }
    public int? Level { get; init; }
}

public class ItemOwnersResponse
{
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public required List<ItemOwnerEntry> Owners { get; init; }
}
