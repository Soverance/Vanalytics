namespace Vanalytics.Core.Models;

// 1:1 with Character. Populated by the addon's satellite sync from FFXI
// packet 0x056 Types 0x00D0 (Nation+Zilart completed missions, bitfield),
// 0x00D8 (ToAU+WotG completed, bitfield), 0x00C0 (Assault completed,
// bitfield), 0xFFFE (current TVR mission, pointer), and 0xFFFF (current
// CoP/ACP/MKD/ASA/SoA/RoV missions, pointers).
//
// All 14 mission lines stored as a single JSON blob — read-mostly, per
// character, no cross-character queries needed.
public class CharacterMissions
{
    public Guid CharacterId { get; set; }

    public string? MissionsJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
