namespace Vanalytics.Api.DTOs;

public class PlayerListItem
{
    public required string Name { get; init; }
    public required string Server { get; init; }
    public string? Job { get; init; }
    public int? Level { get; init; }
    public string? Race { get; init; }
    public string? Linkshell { get; init; }
    public DateTimeOffset? LastSyncedAt { get; init; }
    public int TotalScore { get; init; }
}
