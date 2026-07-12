using System.Collections.Generic;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Services.Achievements;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class MissionProgressTests
{
    [Fact]
    public void CountsCompletedBitfieldAndPointerLines()
    {
        var sandoriaTerminal = FindTerminal("sandoriaMissions");
        var copTerminal = FindTerminal("copMissions");

        var lines = new Dictionary<string, MissionLineState>
        {
            ["sandoriaMissions"] = new MissionLineState { Completed = new List<int> { 1, 2, sandoriaTerminal } },
            ["copMissions"] = new MissionLineState { Current = copTerminal },
        };

        Assert.Equal(2, MissionProgress.CountCompletedLines(lines));
    }

    [Fact]
    public void IncompleteLines_NotCounted()
    {
        var sandoriaTerminal = FindTerminal("sandoriaMissions");
        var copTerminal = FindTerminal("copMissions");

        var lines = new Dictionary<string, MissionLineState>
        {
            ["sandoriaMissions"] = new MissionLineState { Completed = new List<int> { 1, 2 } },
            ["copMissions"] = new MissionLineState { Current = copTerminal - 1 },
        };

        Assert.Equal(0, MissionProgress.CountCompletedLines(lines));
    }

    private static int FindTerminal(string key)
    {
        foreach (var t in Vanalytics.Core.Data.MissionTerminals.All)
            if (t.Key == key) return t.TerminalId;
        throw new KeyNotFoundException(key);
    }
}
