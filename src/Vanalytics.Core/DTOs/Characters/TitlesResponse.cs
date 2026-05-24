namespace Vanalytics.Core.DTOs.Characters;

public class TitleEntry
{
    public int TitleId { get; set; }
    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastEquippedAt { get; set; }
}

public class TitlesResponse
{
    // The title the character is currently wearing (from Character.TitleId).
    // Null if no title is equipped or not yet captured.
    public int? CurrentTitleId { get; set; }

    // Every distinct title ever observed equipped on this character during
    // a sync window. Ordered newest-first (by FirstSeenAt desc).
    public List<TitleEntry> Titles { get; set; } = [];
}
