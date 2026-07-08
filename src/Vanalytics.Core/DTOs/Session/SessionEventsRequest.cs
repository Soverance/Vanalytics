using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

public class SessionEventsRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<SessionEventEntry> Events { get; set; } = []; // Max 500 enforced in controller
}

// NOTE: SessionEventEntry intentionally carries NO per-field validation
// attributes (no [Required] / [MaxLength]). The addon's greedy chat-log
// parser can occasionally emit a mis-parsed event whose Source/Target/etc.
// overflows the DB column width. With DataAnnotations, ASP.NET's automatic
// model validation would reject the ENTIRE batch (400) for one bad entry,
// which — combined with the addon's retry-on-failure — silently drops whole
// sessions. Instead the controller sanitizes each entry individually
// (truncate to column width, skip unparseable EventType) so one bad line can
// never poison the other 499.
public class SessionEventEntry
{
    public string EventType { get; set; } = string.Empty;

    public DateTimeOffset Timestamp { get; set; }

    public string Source { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public long Value { get; set; }

    public string? Ability { get; set; }

    public int? ItemId { get; set; }

    public string Zone { get; set; } = string.Empty;
}
