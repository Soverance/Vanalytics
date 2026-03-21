using Soverance.Auth.Models;

namespace Vanalytics.Core.Models;

public class BazaarPresence
{
    public long Id { get; set; }
    public int ServerId { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public string Zone { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public Guid ReportedByUserId { get; set; }

    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
