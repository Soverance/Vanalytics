using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Services.Economy;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

/// <summary>Per-item single/stack AH medians over a recent window on one world.</summary>
public record AhMedians(int? SingleMedian, int SingleCount, int? StackMedian, int StackCount, DateTimeOffset? LastSoldAt);

/// <summary>
/// Shared home for the "single vs stack 30-day median" definition consumed by both the
/// per-character Sell Advisor and the roster aggregate, so the two can't drift.
/// </summary>
public static class AhMedianService
{
    public static async Task<Dictionary<int, AhMedians>> GetMediansAsync(
        VanalyticsDbContext db, int serverId, IReadOnlyCollection<int> itemIds, int sinceDays = 30)
    {
        var result = new Dictionary<int, AhMedians>();
        if (itemIds.Count == 0) return result;

        var since = DateTimeOffset.UtcNow.AddDays(-sinceDays);
        var sales = await db.AuctionSales
            .Where(s => s.ServerId == serverId && s.SoldAt >= since && itemIds.Contains(s.ItemId))
            .Select(s => new { s.ItemId, s.Price, s.StackSize, s.SoldAt })
            .ToListAsync();

        foreach (var g in sales.GroupBy(s => s.ItemId))
        {
            var singles = g.Where(s => s.StackSize == 1).Select(s => s.Price).ToList();
            var stacks = g.Where(s => s.StackSize > 1).Select(s => s.Price).ToList();
            result[g.Key] = new AhMedians(
                singles.Count > 0 ? PriceMath.Median(singles) : null,
                singles.Count,
                stacks.Count > 0 ? PriceMath.Median(stacks) : null,
                stacks.Count,
                g.Max(s => s.SoldAt));
        }
        return result;
    }
}
