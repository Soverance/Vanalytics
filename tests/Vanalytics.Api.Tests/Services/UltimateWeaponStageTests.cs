using Vanalytics.Core.Data;

namespace Vanalytics.Api.Tests.Services;

public class UltimateWeaponStageTests
{
    [Theory]
    [InlineData(75, null, null, "Lv.75")]
    [InlineData(80, null, null, "Lv.80")]
    [InlineData(85, null, "DMG:43 ...", "Lv.85")]
    [InlineData(95, null, "", "Lv.95")]
    [InlineData(99, null, null, "Lv.99")]
    public void Derive_LevelCapStages(int level, int? itemLevel, string? description, string expected)
        => Assert.Equal(expected, UltimateWeaponStage.Derive(level, itemLevel, description));

    [Theory]
    [InlineData(99, null, "DMG:+52 Delay:+86 Attack+40\n\"Final Heaven\" Afterglow", "Lv.99 (Augmented)")]
    [InlineData(99, 119, "DMG:130 ... \"Final Heaven\"", "Reforged")]
    [InlineData(99, 119, "DMG:182 ... Aftermath: ... Afterglow", "Afterglow")]
    public void Derive_AfterglowAndReforgeStages(int? level, int? itemLevel, string? description, string expected)
        => Assert.Equal(expected, UltimateWeaponStage.Derive(level, itemLevel, description));

    [Fact]
    public void Derive_MythicAftermathKeywordDoesNotPromoteStage()
    {
        // Mythics carry "Aftermath:" from Lv.75 — must not be confused with a Reforge marker.
        var desc = "DMG:31 Delay:205 \"Pyrrhic Kleos\" Aftermath: Increases Acc./Atk.";
        Assert.Equal("Lv.75", UltimateWeaponStage.Derive(75, null, desc));
    }

    [Fact]
    public void Derive_UnknownWhenNoLevel()
        => Assert.Equal("Unknown", UltimateWeaponStage.Derive(null, null, null));

    [Fact]
    public void Rank_OrdersStagesByInGameProgression()
    {
        var ranks = new[]
        {
            UltimateWeaponStage.Rank(75, null, null),
            UltimateWeaponStage.Rank(80, null, null),
            UltimateWeaponStage.Rank(85, null, null),
            UltimateWeaponStage.Rank(90, null, null),
            UltimateWeaponStage.Rank(95, null, null),
            UltimateWeaponStage.Rank(99, null, null),
            UltimateWeaponStage.Rank(99, null, "Afterglow"),
            UltimateWeaponStage.Rank(99, 119, null),
            UltimateWeaponStage.Rank(99, 119, "Afterglow"),
        };

        // Strictly ascending.
        for (var i = 1; i < ranks.Length; i++)
            Assert.True(ranks[i] > ranks[i - 1], $"Rank[{i}] ({ranks[i]}) should exceed Rank[{i - 1}] ({ranks[i - 1]})");
    }
}
