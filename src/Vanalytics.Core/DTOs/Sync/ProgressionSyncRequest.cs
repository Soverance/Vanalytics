using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

// Payload posted by the addon to /api/sync/progression. Data comes from
// FFXI server packet 0x063 Orders 0x02 (limit/merit points), 0x05 (job
// points), and 0x06 (warps). The addon decodes bitmasks into ID arrays
// and per-job tuples before sending — the API only persists JSON blobs.
public class ProgressionSyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    public int? LimitPoints { get; set; }
    public int? MeritPointsMax { get; set; }

    public bool? JobPointsUnlocked { get; set; }

    public List<JobPointEntry>? JobPoints { get; set; }

    public WarpUnlocks? Warps { get; set; }
}

public class JobPointEntry
{
    [Required]
    public int JobId { get; set; }

    public int CapacityPoints { get; set; }
    public int Points { get; set; }
    public int PointsSpent { get; set; }
}

public class WarpUnlocks
{
    public List<int> HomePoints { get; set; } = [];
    public List<int> SurvivalGuides { get; set; } = [];
    public List<int> Waypoints { get; set; } = [];
    public List<int> Telepoints { get; set; } = [];
    public List<int> Atmas { get; set; } = [];
    public List<int> EschanPortals { get; set; } = [];
}
