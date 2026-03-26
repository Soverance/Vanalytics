using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class SessionEvent
{
    public long Id { get; set; }
    public Guid SessionId { get; set; }
    public SessionEventType EventType { get; set; }
    public DateTimeOffset Timestamp { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public long Value { get; set; }
    public string? Ability { get; set; }
    public int? ItemId { get; set; }
    public string Zone { get; set; } = string.Empty;

    public Session Session { get; set; } = null!;
}
