using Vanalytics.Core.DTOs.Sync;

namespace Vanalytics.Core.DTOs.Characters;

public class MissionsResponse
{
    public MissionLineState? SandoriaMissions { get; set; }
    public MissionLineState? BastokMissions { get; set; }
    public MissionLineState? WindurstMissions { get; set; }
    public MissionLineState? ZilartMissions { get; set; }
    public MissionLineState? AhturhganMissions { get; set; }
    public MissionLineState? WotgMissions { get; set; }
    public MissionLineState? Assaults { get; set; }

    public MissionLineState? CopMissions { get; set; }
    public MissionLineState? AcpMissions { get; set; }
    public MissionLineState? MkdMissions { get; set; }
    public MissionLineState? AsaMissions { get; set; }
    public MissionLineState? SoaMissions { get; set; }
    public MissionLineState? RovMissions { get; set; }
    public MissionLineState? TvrMissions { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }
}
