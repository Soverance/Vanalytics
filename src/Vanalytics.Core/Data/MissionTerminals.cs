using System.Collections.Generic;

namespace Vanalytics.Core.Data;

/// <summary>
/// The final ("terminal") mission of each of the 14 lines. A bitfield line is
/// complete when its terminal bit is set; a pointer line is complete when the
/// player's current internal id has reached the terminal id. Terminal ids are the
/// maximum id in each line's catalog in Vanalytics.Web/src/lib/missions.ts.
/// </summary>
public static class MissionTerminals
{
    public record MissionTerminal(string Key, bool IsBitfield, int TerminalId);

    public static readonly IReadOnlyList<MissionTerminal> All =
    [
        // Bitfield lines — terminal = max bit position in catalog
        new("sandoriaMissions", true,  23),  // "The Heir to the Light"
        new("bastokMissions",   true,  23),  // "Where Two Paths Converge"
        new("windurstMissions", true,  23),  // "Moon Reading"
        new("zilartMissions",   true,  30),  // "Awakening"
        new("ahturhganMissions",true,  46),  // "The Empress Crowned"
        new("wotgMissions",     true,  52),  // "A Token of Troth"
        new("assaults",         true,  52),  // "Nyzul Isle Uncharted Area Survey"
        // Pointer lines — terminal = max internal id in catalog
        new("copMissions",      false, 840), // "__Dawn"
        new("acpMissions",      false, 10),  // "Ode of Life Bestowing"
        new("mkdMissions",      false, 13),  // "Smash! A Malevolent Menace"
        new("asaMissions",      false, 13),  // "An Uneasy Peace"
        new("soaMissions",      false, 368), // "____The Light Within"
        new("rovMissions",      false, 334), // "__A Rhapsody for the Ages"
        new("tvrMissions",      false, 624), // "__The Voracious Beast"
    ];
}
