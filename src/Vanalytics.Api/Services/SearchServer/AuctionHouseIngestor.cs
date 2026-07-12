using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.SearchServer;

public class AuctionHouseIngestor(VanalyticsDbContext db)
{
    public async Task<int> IngestAsync(int itemId, int serverId, IReadOnlyList<AhSale> sales,
        DateTimeOffset observedAt, CancellationToken ct)
    {
        if (sales.Count == 0) return 0;

        int itemStack = await db.GameItems
            .Where(i => i.ItemId == itemId)
            .Select(i => i.StackSize)
            .FirstOrDefaultAsync(ct);
        if (itemStack <= 0) itemStack = 1;

        static int StackSizeOf(AhSale s, int itemStack) => s.Stack ? itemStack : 1;
        static string Key(int price, DateTimeOffset soldAt, string buyer, string seller, int stack)
            => $"{price}|{soldAt:O}|{buyer}|{seller}|{stack}";

        var soldDates = sales.Select(s => s.SoldAt).Distinct().ToList();
        var existing = await db.AuctionSales
            .Where(s => s.ItemId == itemId && s.ServerId == serverId && soldDates.Contains(s.SoldAt))
            .Select(s => new { s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .ToListAsync(ct);
        var seen = new HashSet<string>(
            existing.Select(s => Key(s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize)));

        int added = 0;
        foreach (var s in sales)
        {
            // Defense-in-depth: never persist an implausible sale (stale/garbage server memory).
            // The decoder fix stops padded-slot over-reads at the source; this is the backstop.
            if (!AhSaleValidation.IsPlausible(s.Price, s.SoldAt, observedAt)) continue;

            int stack = StackSizeOf(s, itemStack);
            var key = Key(s.Price, s.SoldAt, s.BuyerName, s.SellerName, stack);
            if (!seen.Add(key)) continue;
            db.AuctionSales.Add(new AuctionSale
            {
                ItemId = itemId,
                ServerId = serverId,
                Price = s.Price,
                SoldAt = s.SoldAt,
                SellerName = s.SellerName,
                BuyerName = s.BuyerName,
                StackSize = stack,
                ObservedAt = observedAt,
            });
            added++;
        }
        if (added > 0) await db.SaveChangesAsync(ct);
        return added;
    }
}
