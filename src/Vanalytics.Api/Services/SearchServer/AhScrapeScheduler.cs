using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.SearchServer;

public readonly record struct ScrapeUnit(int ItemId, bool Stack);

public class AhScrapeScheduler(VanalyticsDbContext db)
{
    public async Task EnsureStateSeededAsync(int serverId, CancellationToken ct)
    {
        var items = await db.GameItems
            .Where(i => (i.Flags & 0x40) == 0)
            .Select(i => new { i.ItemId, i.StackSize })
            .ToListAsync(ct);

        var existing = await db.AhScrapeStates
            .Where(s => s.ServerId == serverId)
            .Select(s => new { s.ItemId, s.Stack })
            .ToListAsync(ct);
        var have = new HashSet<(int, bool)>(existing.Select(e => (e.ItemId, e.Stack)));

        foreach (var it in items)
        {
            if (have.Add((it.ItemId, false)))
                db.AhScrapeStates.Add(new AhScrapeState { ServerId = serverId, ItemId = it.ItemId, Stack = false });
            if (it.StackSize > 1 && have.Add((it.ItemId, true)))
                db.AhScrapeStates.Add(new AhScrapeState { ServerId = serverId, ItemId = it.ItemId, Stack = true });
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<ScrapeUnit>> NextBatchAsync(int serverId, int batchSize, CancellationToken ct) =>
        await db.AhScrapeStates
            .Where(s => s.ServerId == serverId)
            .OrderBy(s => s.LastScrapedAt == null ? 0 : 1)
            .ThenBy(s => s.LastScrapedAt)
            .Take(batchSize)
            .Select(s => new ScrapeUnit(s.ItemId, s.Stack))
            .ToListAsync(ct);

    public async Task MarkScrapedAsync(int serverId, IReadOnlyList<ScrapeUnit> units, DateTimeOffset at, CancellationToken ct)
    {
        if (units.Count == 0) return;
        var itemIds = units.Select(u => u.ItemId).Distinct().ToList();
        var set = new HashSet<(int ItemId, bool Stack)>(units.Select(u => (u.ItemId, u.Stack)));
        var rows = await db.AhScrapeStates
            .Where(s => s.ServerId == serverId && itemIds.Contains(s.ItemId))
            .ToListAsync(ct);
        foreach (var row in rows)
            if (set.Contains((row.ItemId, row.Stack)))
                row.LastScrapedAt = at;
        await db.SaveChangesAsync(ct);
    }
}
