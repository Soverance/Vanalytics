namespace Vanalytics.Core.Data;

/// <summary>
/// Classifies a specific ItemId of an Ultimate weapon into its upgrade-path
/// stage label. Inputs come from GameItem fields populated by Windower's
/// items.lua and item_descriptions.lua.
///
/// The "Afterglow" keyword is canonical FFXI nomenclature and appears across
/// 154 items in the Windower description data — using it as the sub-tier
/// discriminator is stable. "Aftermath:" cannot be used because Mythic weapons
/// carry it from their Lv.75 base form.
/// </summary>
public static class UltimateWeaponStage
{
    public static string Derive(int? level, int? itemLevel, string? description)
    {
        var hasAfterglow = HasAfterglow(description);
        return (level, itemLevel, hasAfterglow) switch
        {
            (_, 119, true)    => "Afterglow",
            (_, 119, false)   => "Reforged",
            (99, null, true)  => "Lv.99 (Augmented)",
            (int lv, null, _) => $"Lv.{lv}",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Canonical progression rank: low to high follows in-game upgrade order
    /// (Lv.75 → 80 → ... → 99 → 99 Augmented → Reforged → Afterglow).
    /// </summary>
    public static int Rank(int? level, int? itemLevel, string? description)
    {
        var hasAfterglow = HasAfterglow(description);
        return (level, itemLevel, hasAfterglow) switch
        {
            (_, 119, true)    => 1000,
            (_, 119, false)   => 900,
            (99, null, true)  => 800,
            (int lv, null, _) => lv,
            _ => -1
        };
    }

    private static bool HasAfterglow(string? description)
        => description?.Contains("Afterglow", System.StringComparison.Ordinal) == true;
}
