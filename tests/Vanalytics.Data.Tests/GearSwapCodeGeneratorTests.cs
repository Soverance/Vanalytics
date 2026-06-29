// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorTests.cs
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorTests
{
    private static ResolvedGearSet Set(long id, string name, params ResolvedSlot[] slots) =>
        new(id, name, slots);

    private static ResolvedSlot Slot(string slot, int itemId, string name, params string[] augs) =>
        new(slot, itemId, name, augs);

    [Fact]
    public void EmitSets_writes_bracket_keyed_set_with_mapped_slot_keys()
    {
        var lua = GearSwapCodeGenerator.EmitSets(
        [
            Set(1, "TP Accuracy",
                Slot("Ammo", 100, "Ginsen"),
                Slot("Ear1", 101, "Brutal Earring"),
                Slot("Legs", 102, "Plun. Culottes +1", "Enhances \"Feint\" effect"))
        ]);

        // Bracket-keyed header; Ear1 maps to left_ear; augmented slot uses the table form.
        Assert.Contains("sets['TP Accuracy'] = {", lua);
        Assert.Contains("ammo=\"Ginsen\",", lua);
        Assert.Contains("left_ear=\"Brutal Earring\",", lua);
        Assert.Contains("legs={ name=\"Plun. Culottes +1\", augments={'Enhances \"Feint\" effect',}},", lua);
    }

    [Fact]
    public void EmitSets_dedupes_by_id()
    {
        var s = Set(1, "Dup", Slot("Head", 1, "Hat"));
        var lua = GearSwapCodeGenerator.EmitSets([s, s]);
        // The set definition appears exactly once.
        var occurrences = lua.Split("sets['Dup'] = {").Length - 1;
        Assert.Equal(1, occurrences);
    }
}
