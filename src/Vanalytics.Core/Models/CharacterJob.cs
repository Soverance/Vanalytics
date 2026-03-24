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

    public Character Character { get; set; } = null!;
}
