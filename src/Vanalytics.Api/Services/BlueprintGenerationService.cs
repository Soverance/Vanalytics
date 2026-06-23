using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

// Loads a character+job blueprint graph and its referenced gear sets, then validates and generates the
// GearSwap .lua. Shared by the web GenerateBlueprint endpoint and the addon's //va blueprint pull so
// both produce byte-identical output. BlueprintExists is false when no blueprint row is saved for the
// (character, job) pair — the web treats that as "generate from an empty graph" while the addon maps it
// to a 404 ("no blueprint yet").
public class BlueprintGenerationService
{
    private readonly VanalyticsDbContext _db;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public BlueprintGenerationService(VanalyticsDbContext db) => _db = db;

    public async Task<(bool BlueprintExists, GenerateBlueprintResponse Response)> GenerateAsync(
        Guid characterId, string normalizedJob)
    {
        var wf = await _db.CharacterJobBlueprints
            .FirstOrDefaultAsync(w => w.CharacterId == characterId && w.Job == normalizedJob);
        var exists = wf is not null;

        var graph = wf is null
            ? new BlueprintGraphDto()
            : JsonSerializer.Deserialize<BlueprintGraphDto>(wf.GraphJson, JsonOpts) ?? new BlueprintGraphDto();

        var modeSetIds = graph.Nodes
            .Where(n => n.Type == "mode")
            .SelectMany(n => n.Data.Members ?? [])
            .Select(m => m.GearSetId);

        // Overlay layers reference extra sets via OverlaySetIds; these must be resolved too, otherwise a
        // set used only inside a set_combine (and nowhere as a plain equip/mode leaf) is missing.
        var overlaySetIds = graph.Nodes
            .Where(n => n.Type == "equip")
            .SelectMany(n => n.Data.OverlaySetIds ?? [])
            .Concat(graph.Nodes
                .Where(n => n.Type == "mode")
                .SelectMany(n => n.Data.Members ?? [])
                .SelectMany(m => m.OverlaySetIds ?? []));

        var referencedIds = graph.Nodes
            .Where(n => n.Type == "equip" && n.Data.GearSetId is not null)
            .Select(n => n.Data.GearSetId!.Value)
            .Concat(modeSetIds)
            .Concat(overlaySetIds)
            .Distinct()
            .ToList();

        var sets = await _db.CharacterGearSets
            .Where(s => s.CharacterId == characterId && referencedIds.Contains(s.Id))
            .Include(s => s.Slots)
            .ToListAsync();

        var resolved = sets.Select(s => new ResolvedGearSet(
            s.Id, s.Name,
            s.Slots.Select(sl => new ResolvedSlot(
                sl.Slot, sl.ItemId, sl.ItemName,
                DeserializeAugments(sl.AugmentsJson))).ToList()))
            .ToList();

        var diagnostics = GearSwapCodeGenerator.Validate(graph, resolved);
        if (diagnostics.Any(d => d.Severity == "error"))
            return (exists, new GenerateBlueprintResponse { Lua = "", Diagnostics = diagnostics });

        var result = GearSwapCodeGenerator.Generate(graph, resolved);
        return (exists, new GenerateBlueprintResponse { Lua = result.Lua, Diagnostics = diagnostics });
    }

    private static List<string> DeserializeAugments(string? json) =>
        string.IsNullOrEmpty(json) ? [] : (JsonSerializer.Deserialize<List<string>>(json) ?? []);
}
