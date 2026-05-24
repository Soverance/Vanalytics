using Vanalytics.Core.DTOs.Sync;

namespace Vanalytics.Core.DTOs.Characters;

public class ProgressionResponse
{
    public int? LimitPoints { get; set; }
    public int? MeritPoints { get; set; }
    public int? MeritPointsMax { get; set; }

    public bool? JobPointsUnlocked { get; set; }

    public List<JobPointEntry>? JobPoints { get; set; }

    public WarpUnlocks? Warps { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }
}
