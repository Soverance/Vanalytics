using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Core.Services.GearSwapImport;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class GearSwapImportService(VanalyticsDbContext db)
{
    private readonly VanalyticsDbContext _db = db;

    /// <summary>Parses a GearSwap .lua file and resolves every slot against the character's
    /// catalog + ownership. Pure read — writes nothing.</summary>
    public async Task<GearSwapImportPreview> BuildPreviewAsync(Guid characterId, string lua, string? suggestedJob, CancellationToken ct)
    {
        var parsed = GearSwapSetParser.Parse(lua);

        // Candidate catalog: equippable items only (mirrors the owned-equipment slot filter).
        var catalog = await _db.GameItems
            .Where(i => i.Slots != null && i.Slots != 0)
            .Select(i => new { i.ItemId, i.Name })
            .ToListAsync(ct);
        var resolver = new ItemNameResolver(catalog.Select(c => (c.ItemId, c.Name)));

        // Ownership: inventory ∪ equipped (same source as owned-equipment endpoint).
        var ownedIds = new HashSet<int>(
            await _db.CharacterInventories.Where(i => i.CharacterId == characterId).Select(i => i.ItemId).ToListAsync(ct));
        foreach (var id in await _db.EquippedGear.Where(g => g.CharacterId == characterId && g.ItemId != 0).Select(g => g.ItemId).ToListAsync(ct))
            ownedIds.Add(id);

        // Existing set names for the overwrite badge.
        var existingNames = new HashSet<string>(
            await _db.CharacterGearSets.Where(s => s.CharacterId == characterId).Select(s => s.Name).ToListAsync(ct),
            StringComparer.OrdinalIgnoreCase);

        var preview = new GearSwapImportPreview { SuggestedJob = suggestedJob, Warnings = parsed.Warnings.ToList() };

        foreach (var set in parsed.Sets)
        {
            var sp = new ImportSetPreview
            {
                Name = set.FriendlyName,
                Category = set.Category,
                LuaKey = set.LuaKey,
                OverwritesExisting = existingNames.Contains(set.FriendlyName),
            };
            foreach (var slot in set.Slots)
            {
                var m = resolver.Resolve(slot.ItemName);
                sp.Slots.Add(new ImportSlotPreview
                {
                    Slot = slot.Slot,
                    RawName = slot.ItemName,
                    ItemId = m.ItemId,
                    ItemName = m.MatchKind == "unresolved" ? slot.ItemName : m.CanonicalName,
                    MatchKind = m.MatchKind,
                    Confidence = m.Confidence,
                    Owned = m.ItemId != 0 && ownedIds.Contains(m.ItemId),
                    Augments = slot.Augments.ToList(),
                });
            }
            preview.Sets.Add(sp);
        }

        return preview;
    }
}
