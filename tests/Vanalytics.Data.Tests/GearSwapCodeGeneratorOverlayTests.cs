// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorOverlayTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorOverlayTests
{
    private static ResolvedGearSet Set(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 100 + (int)id, $"Hat{id}", [])]);

    private static BlueprintEdgeDto Edge(string src, string handle, string tgt) =>
        new() { Id = $"{src}-{handle}-{tgt}", Source = src, SourceHandle = handle, Target = tgt, TargetHandle = "in" };

    private static BlueprintNodeDto Equip(string id, long? baseId, long[]? overlays = null, string? action = null) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = baseId, OverlaySetIds = overlays?.ToList(), ActionName = action } };

    [Fact]
    public void EquipExpr_one_set_is_plain_reference()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy" };
        Assert.Equal("sets['Accuracy']", GearSwapCodeGenerator.EquipExpr(10, null, names));
    }

    [Fact]
    public void EquipExpr_base_plus_overlay_is_set_combine_right_most_wins()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy", [11] = "TH Swap" };
        Assert.Equal("set_combine(sets['Accuracy'], sets['TH Swap'])",
            GearSwapCodeGenerator.EquipExpr(10, [11], names));
    }

    [Fact]
    public void EquipExpr_drops_unresolved_and_degrades_to_plain()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy" };
        Assert.Equal("sets['Accuracy']", GearSwapCodeGenerator.EquipExpr(10, [999], names));
    }

    [Fact]
    public void EquipExpr_null_when_nothing_resolves()
    {
        var names = new Dictionary<long, string>();
        Assert.Null(GearSwapCodeGenerator.EquipExpr(10, [11], names));
        Assert.Null(GearSwapCodeGenerator.EquipExpr(null, null, names));
    }
}
