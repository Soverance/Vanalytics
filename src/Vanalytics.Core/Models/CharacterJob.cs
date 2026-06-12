using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CharacterJob
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public JobType JobId { get; set; }
    public int Level { get; set; }
    public bool IsActive { get; set; }
    public int JP { get; set; }
    public int JPSpent { get; set; }
    public int CP { get; set; }

    // Master Level — null when the job has no Master Breaker (locked),
    // 0–50 when unlocked. EP fields accumulate from packet 0x061 per active job.
    public int? MasterLevel { get; set; }
    public int? MasterEpCurrent { get; set; }
    public int? MasterEpNeeded { get; set; }
    public bool MasterCapped { get; set; }

    public Character Character { get; set; } = null!;
}
