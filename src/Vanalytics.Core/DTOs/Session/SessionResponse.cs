using Vanalytics.Core.Enums;

namespace Vanalytics.Core.DTOs.Session;

public class SessionSummaryResponse
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string Zone { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public SessionStatus Status { get; set; }
    public long TotalDamage { get; set; }
    public long GilEarned { get; set; }
    public int MobsKilled { get; set; }
    public int ItemsDropped { get; set; }
}

public class SessionDetailResponse : SessionSummaryResponse
{
    public double DpsAverage { get; set; }
    public double GilPerHour { get; set; }
    public long ExpGained { get; set; }
    public long HealingDone { get; set; }
    public int EventCount { get; set; }
}

public class SessionEventResponse
{
    public long Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public long Value { get; set; }
    public string? Ability { get; set; }
    public int? ItemId { get; set; }
    public string Zone { get; set; } = string.Empty;
}

public class SessionTimelineEntry
{
    public DateTimeOffset Timestamp { get; set; }
    public long Damage { get; set; }
    public long Healing { get; set; }
    public long Gil { get; set; }
    public int Kills { get; set; }
}
