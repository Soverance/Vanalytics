namespace Vanalytics.Core.DTOs.Characters;

public class LinkshellsResponse
{
    public List<CharacterLinkshellEntry> Linkshells { get; set; } = [];
}

public class CharacterLinkshellEntry
{
    public string Name { get; set; } = string.Empty;

    /// <summary>Packed RGB (r &lt;&lt; 16 | g &lt;&lt; 8 | b) for the pearl icon.</summary>
    public int ColorRgb { get; set; }

    /// <summary>Custom linkshell logo URL, or null to fall back to the pearl.</summary>
    public string? LogoUrl { get; set; }

    /// <summary>"Member" | "Sackholder" | "Leader".</summary>
    public string Rank { get; set; } = string.Empty;

    /// <summary>True if the character's latest sync still reports this linkshell.</summary>
    public bool IsCurrent { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }
}
