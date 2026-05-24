namespace Vanalytics.Core.Models;

// 1:1 with Character. Populated by the addon's satellite sync from
// packet 0x063 Orders 0x02 (limit/merit points), 0x05 (job points),
// and 0x06 (warp bitmasks). JSON blobs store decoded ID arrays /
// per-job tuples so the schema doesn't need to grow as new warp
// destinations or jobs are added to the game.
public class CharacterProgression
{
    public Guid CharacterId { get; set; }

    public int? LimitPoints { get; set; }
    public int? MeritPoints { get; set; }
    public int? MeritPointsMax { get; set; }

    public bool? JobPointsUnlocked { get; set; }

    public string? WarpsJson { get; set; }
    public string? JobPointsJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
