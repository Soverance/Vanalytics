namespace Vanalytics.Core.Data;

/// <summary>A single ultimate-weapon GameItems row, projected for rank calculation.</summary>
public record UwCatalogItem(int ItemId, string Name, int? Level, int? ItemLevel, string? Description);

/// <summary>
/// Pure ultimate-weapon rank math shared by the character relics page and the achievement
/// recompute. Given the UW catalog and the set of item ids a character has ever held, returns the
/// highest <see cref="UltimateWeaponStage.Rank"/> per base weapon name, keeping only rank &gt;= 75
/// (the base-weapon threshold).
/// </summary>
public static class UltimateWeaponRankCalculator
{
    public static List<int> Compute(IReadOnlyCollection<UwCatalogItem> catalog, ISet<int> everHeldItemIds)
    {
        return catalog
            .Where(i => everHeldItemIds.Contains(i.ItemId))
            .GroupBy(i => i.Name)
            .Select(g => g.Max(i => UltimateWeaponStage.Rank(i.Level, i.ItemLevel, i.Description)))
            .Where(rank => rank >= 75)
            .ToList();
    }
}
