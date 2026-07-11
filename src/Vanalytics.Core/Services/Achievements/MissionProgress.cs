using System.Collections.Generic;
using System.Linq;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Sync;

namespace Vanalytics.Core.Services.Achievements;

public static class MissionProgress
{
    /// <summary>
    /// Counts completed mission lines from the stored MissionsJson shape:
    /// Dictionary keyed by camelCase line name (matching MissionTerminals keys)
    /// -> MissionLineState with a Completed index list for bitfield lines /
    /// a Current index for pointer lines.
    /// </summary>
    public static int CountCompletedLines(IReadOnlyDictionary<string, MissionLineState> lines)
    {
        int completed = 0;
        foreach (var terminal in MissionTerminals.All)
        {
            if (!lines.TryGetValue(terminal.Key, out var state) || state is null) continue;
            bool done = terminal.IsBitfield
                ? state.Completed is { } list && list.Contains(terminal.TerminalId)
                : state.Current is int cur && terminal.TerminalId > 0 && cur >= terminal.TerminalId;
            if (done) completed++;
        }
        return completed;
    }
}
