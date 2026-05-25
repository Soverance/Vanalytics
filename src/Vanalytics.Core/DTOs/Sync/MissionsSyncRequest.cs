using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

// Payload posted by the addon to /api/sync/missions. Each mission line is
// either bitfield-style (Completed = array of completed mission indices)
// or pointer-style (Current = single in-progress mission index). The
// addon ships only the lines it has decoded so far; missing lines are
// preserved server-side (patch semantics).
public class MissionsSyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    // Bitfield-style: completed mission indices (packet 0x056 Type 0x00D0/0x00D8/0x00C0).
    public MissionLineState? SandoriaMissions { get; set; }
    public MissionLineState? BastokMissions { get; set; }
    public MissionLineState? WindurstMissions { get; set; }
    public MissionLineState? ZilartMissions { get; set; }
    public MissionLineState? AhturhganMissions { get; set; }
    public MissionLineState? WotgMissions { get; set; }
    public MissionLineState? Assaults { get; set; }

    // Pointer-style: current in-progress mission index (packet 0x056 Type 0xFFFE/0xFFFF).
    public MissionLineState? CopMissions { get; set; }
    public MissionLineState? AcpMissions { get; set; }
    public MissionLineState? MkdMissions { get; set; }
    public MissionLineState? AsaMissions { get; set; }
    public MissionLineState? SoaMissions { get; set; }
    public MissionLineState? RovMissions { get; set; }
    public MissionLineState? TvrMissions { get; set; }
}

public class MissionLineState
{
    // Set for bitfield-style lines. List of mission indices the player has completed.
    public List<int>? Completed { get; set; }

    // Set for pointer-style lines. The mission index the player is currently on
    // (or has completed if equal to the line's terminal mission).
    public int? Current { get; set; }
}
