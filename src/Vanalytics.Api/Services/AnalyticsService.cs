using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Analytics;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public record OwnedWeapon(Guid CharacterId, string Server, string Weapon, string Category, int Rank);

/// <summary>
/// Read-only population aggregations for the public Analytics tab. Intentionally
/// NOT filtered by Character.IsPublic — all output is nameless aggregates. Caching
/// is the caller's (controller's) responsibility.
/// </summary>
public class AnalyticsService(VanalyticsDbContext db)
{
    public Task<int> CharacterScopeCountAsync(string? server, CancellationToken ct = default)
    {
        var q = db.Characters.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(server)) q = q.Where(c => c.Server == server);
        return q.CountAsync(ct);
    }

    public async Task<List<OwnedWeapon>> OwnedUltimateWeaponsAsync(string? server, CancellationToken ct = default)
    {
        var defs = UltimateWeapons.All;
        var baseNames = defs.Select(w => w.BaseName).Distinct().ToList();
        var categoryByName = defs.GroupBy(w => w.BaseName)
            .ToDictionary(g => g.Key, g => g.First().Category);

        // Resolve the small set of UW GameItems up front (bounds everything downstream).
        var uwItems = await db.GameItems.AsNoTracking()
            .Where(gi => baseNames.Contains(gi.Name))
            .Select(gi => new { gi.ItemId, gi.Name, gi.Level, gi.ItemLevel, gi.Description })
            .ToListAsync(ct);
        var uwItemIds = uwItems.Select(x => x.ItemId).ToList();
        var itemById = uwItems.ToDictionary(x => x.ItemId);

        // Ever-held = current inventory ∪ Added inventory changes, restricted to UW item ids.
        var owned = db.CharacterInventories.AsNoTracking()
            .Where(i => uwItemIds.Contains(i.ItemId))
            .Select(i => new { i.CharacterId, i.ItemId })
            .Union(db.InventoryChanges.AsNoTracking()
                .Where(c => c.ChangeType == InventoryChangeType.Added && uwItemIds.Contains(c.ItemId))
                .Select(c => new { c.CharacterId, c.ItemId }));

        var joined = owned.Join(db.Characters, x => x.CharacterId, c => c.Id,
            (x, c) => new { x.CharacterId, c.Server, x.ItemId });
        if (!string.IsNullOrWhiteSpace(server))
            joined = joined.Where(x => x.Server == server);

        var rows = await joined.Distinct().ToListAsync(ct);

        // Stage rank is C# logic — compute in memory, take max per (character, weapon), keep >= 75.
        return rows
            .Select(r =>
            {
                var it = itemById[r.ItemId];
                return new
                {
                    r.CharacterId,
                    r.Server,
                    it.Name,
                    Rank = UltimateWeaponStage.Rank(it.Level, it.ItemLevel, it.Description)
                };
            })
            .GroupBy(x => new { x.CharacterId, x.Server, x.Name })
            .Select(g => new { g.Key.CharacterId, g.Key.Server, g.Key.Name, Rank = g.Max(x => x.Rank) })
            .Where(x => x.Rank >= 75)
            .Select(x => new OwnedWeapon(x.CharacterId, x.Server, x.Name, categoryByName[x.Name], x.Rank))
            .ToList();
    }

    public async Task<List<UltimateWeaponRarityEntry>> UltimateWeaponRarityAsync(string? server, CancellationToken ct = default)
    {
        var owned = await OwnedUltimateWeaponsAsync(server, ct);
        var scope = await CharacterScopeCountAsync(server, ct);
        return owned
            .GroupBy(o => new { o.Weapon, o.Category })
            .Select(g =>
            {
                var owners = g.Select(x => x.CharacterId).Distinct().Count();
                var pct = scope == 0 ? 0 : Math.Round(100.0 * owners / scope, 1);
                return new UltimateWeaponRarityEntry(g.Key.Weapon, g.Key.Category, owners, pct);
            })
            .OrderByDescending(e => e.Owners)
            .ToList();
    }
}
