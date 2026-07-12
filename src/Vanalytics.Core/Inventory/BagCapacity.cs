namespace Vanalytics.Core.Inventory;

/// <summary>
/// Slot-capacity rules shared by every inventory read path. A bag with no stored
/// unlocked capacity (or a non-positive value) falls back to 80 — pixel-identical
/// to the pre-capacity-feature behavior.
/// </summary>
public static class BagCapacity
{
    public const int DefaultMaxSlots = 80;

    /// <summary>Real unlocked capacity for a bag, or the 80 fallback when unknown / non-positive.</summary>
    public static int CapOf(IReadOnlyDictionary<string, int> capacities, string bag)
        => capacities.TryGetValue(bag, out var cap) && cap > 0 ? cap : DefaultMaxSlots;
}
