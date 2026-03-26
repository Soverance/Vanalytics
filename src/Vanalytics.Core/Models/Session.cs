using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class Session
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public string Zone { get; set; } = string.Empty;
    public SessionStatus Status { get; set; }

    public Character Character { get; set; } = null!;
    public List<SessionEvent> Events { get; set; } = [];
}
