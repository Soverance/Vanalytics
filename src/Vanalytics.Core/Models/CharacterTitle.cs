namespace Vanalytics.Core.Models;

// Per-character record of every title ever observed equipped during a
// sync window. Populated by SyncController's title accumulator — every
// main sync includes the currently-equipped TitleId, and we insert a row
// here the first time we see each distinct title on this character.
//
// Same FFXIAH-era trade-off: a title equipped only briefly and never
// during a sync window won't be captured. Collection grows organically
// over time as the player browses through their title list.
public class CharacterTitle
{
    public Guid CharacterId { get; set; }
    public int TitleId { get; set; }

    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastEquippedAt { get; set; }

    public Character Character { get; set; } = null!;
}
