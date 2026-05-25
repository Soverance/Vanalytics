namespace Vanalytics.Core.Models;

/// <summary>
/// Curated Notorious Monster metadata sourced from per-zone JSON files under
/// Vanalytics.Web/public/data/nms/. Lives in a table separate from ZoneSpawns
/// because the LSB spawn sync performs a full delete+rebuild of ZoneSpawns —
/// curated NM data must survive that.
///
/// Presence of any row for a given ZoneId implicitly suppresses the heuristic
/// NM classification in /api/zones/{id}/nm (curated wins).
/// </summary>
public class ZoneNamedMonster
{
    public int Id { get; set; }
    public int ZoneId { get; set; }
    public string MobName { get; set; } = string.Empty;
    public string? Genus { get; set; }

    /// <summary>
    /// Human-readable spawn classification: "timed" | "lottery" | "popped" | "quest".
    /// Distinct from <see cref="ZoneSpawn.SpawnType"/>, which is the LSB integer bitmask.
    /// </summary>
    public string SpawnTypeLabel { get; set; } = string.Empty;

    /// <summary>
    /// Seconds. Semantics differ by SpawnTypeLabel:
    ///   lottery — window-open delay after PH ToD
    ///   timed   — respawn interval (lower bound)
    ///   popped/quest — null
    /// </summary>
    public int? RespawnTime { get; set; }

    /// <summary>Primary placeholder name. Most NMs have 0-1 PHs.</summary>
    public string? PlaceholderName { get; set; }

    /// <summary>Hex string matching BG-wiki convention (e.g. "0x157"). Null when not documented.</summary>
    public string? PlaceholderMobIndex { get; set; }

    public string? Notes { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
