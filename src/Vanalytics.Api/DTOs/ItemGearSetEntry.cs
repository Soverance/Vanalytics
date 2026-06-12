namespace Vanalytics.Api.DTOs;

public class ItemGearSetEntry
{
    public required string Server { get; init; }
    public required string CharacterName { get; init; }
    public long SetId { get; init; }
    public required string SetName { get; init; }
    public required string Category { get; init; }
    public string? Job { get; init; }
}

public class ItemGearSetsResponse
{
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public required List<ItemGearSetEntry> Entries { get; init; }
}
