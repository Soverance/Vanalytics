using System.Linq;
using Vanalytics.Api.Services;
using Vanalytics.Core.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

/// <summary>
/// Pure unit tests for the five JSON decoders on <see cref="AchievementRecomputeService"/>.
/// No database / Docker — each feeds a realistic stored-JSON payload and asserts the count.
/// The decoders are marked <c>internal static</c>; visible here via InternalsVisibleTo.
/// </summary>
public class AchievementDecoderTests
{
    [Fact]
    public void CountMissions_CountsCompletedBitfieldAndPointerLines()
    {
        var sandoria = MissionTerminals.All.Single(t => t.Key == "sandoriaMissions").TerminalId;
        var copTerminal = MissionTerminals.All.Single(t => t.Key == "copMissions").TerminalId;

        // sandoria: bitfield line complete because terminal id is in the completed list.
        // cop: pointer line complete because current >= terminal id.
        var json = $$"""
        {
            "sandoriaMissions": { "completed": [1, 2, {{sandoria}}] },
            "copMissions": { "current": {{copTerminal}} }
        }
        """;

        Assert.Equal(2, AchievementRecomputeService.CountMissions(json));
    }

    [Fact]
    public void CountMerits_SumsAllocatedPoints()
    {
        // Serialized with DEFAULT options (PascalCase keys) per SyncController.
        var json = """{"H2H":8,"Sword":4}""";
        Assert.Equal(12, AchievementRecomputeService.CountMerits(json));
    }

    [Fact]
    public void CountSpellsAndTrusts_SplitsAtTrustBoundary()
    {
        // ids >= 896 are trusts; below are spells.
        var (spells, trusts) = AchievementRecomputeService.CountSpellsAndTrusts("[1,2,896,897]");
        Assert.Equal(2, spells);
        Assert.Equal(2, trusts);
    }

    [Fact]
    public void CountKeyItems_CountsListLength()
    {
        Assert.Equal(3, AchievementRecomputeService.CountKeyItems("[10,20,30]"));
    }

    [Fact]
    public void CountWarps_SumsAllSevenLists()
    {
        var json = """
        {
            "homePoints": [1, 2, 3],
            "survivalGuides": [4, 5],
            "waypoints": [6],
            "telepoints": [],
            "cavernousMaws": [7, 8],
            "lycopodium": [9],
            "eschanPortals": [10, 11, 12, 13]
        }
        """;
        // 3 + 2 + 1 + 0 + 2 + 1 + 4 = 13
        Assert.Equal(13, AchievementRecomputeService.CountWarps(json));
    }

    [Fact]
    public void Decoders_HandleNullAndEmpty()
    {
        Assert.Equal(0, AchievementRecomputeService.CountMissions(null));
        Assert.Equal(0, AchievementRecomputeService.CountMerits(""));
        Assert.Equal((0, 0), AchievementRecomputeService.CountSpellsAndTrusts(null));
        Assert.Equal(0, AchievementRecomputeService.CountKeyItems(null));
        Assert.Equal(0, AchievementRecomputeService.CountWarps(""));
    }
}
