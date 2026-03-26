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

public class SessionEventEntry
{
    [Required]
    public string EventType { get; set; } = string.Empty;

    public DateTimeOffset Timestamp { get; set; }

    [MaxLength(64)]
    public string Source { get; set; } = string.Empty;

    [MaxLength(128)]
    public string Target { get; set; } = string.Empty;

    public long Value { get; set; }

    [MaxLength(128)]
    public string? Ability { get; set; }

    public int? ItemId { get; set; }

    [MaxLength(64)]
    public string Zone { get; set; } = string.Empty;
}
