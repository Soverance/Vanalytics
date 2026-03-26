using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Session;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sessions")]
[Authorize]
public class SessionsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    private static readonly SessionEventType[] DamageTypes =
    [
        SessionEventType.MeleeDamage,
        SessionEventType.RangedDamage,
        SessionEventType.SpellDamage,
        SessionEventType.AbilityDamage,
        SessionEventType.Skillchain,
        SessionEventType.MagicBurst
    ];

    public SessionsController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? characterId,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = GetUserId();

        var query = _db.Sessions
            .Where(s => s.Character.UserId == userId);

        if (characterId.HasValue)
            query = query.Where(s => s.CharacterId == characterId.Value);

        if (from.HasValue)
            query = query.Where(s => s.StartedAt >= from.Value);

        if (to.HasValue)
            query = query.Where(s => s.StartedAt <= to.Value);

        var totalCount = await query.CountAsync();

        var sessions = await query
            .OrderByDescending(s => s.StartedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SessionSummaryResponse
            {
                Id = s.Id,
                CharacterId = s.CharacterId,
                CharacterName = s.Character.Name,
                Server = s.Character.Server,
                Zone = s.Zone,
                StartedAt = s.StartedAt,
                EndedAt = s.EndedAt,
                Status = s.Status,
                TotalDamage = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && DamageTypes.Contains(e.EventType))
                    .Sum(e => e.Value),
                GilEarned = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.GilGain)
                    .Sum(e => e.Value),
                MobsKilled = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.MobKill)
                    .Count(),
                ItemsDropped = _db.SessionEvents
                    .Where(e => e.SessionId == s.Id && e.EventType == SessionEventType.ItemDrop)
                    .Count()
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, sessions });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();

        var session = await _db.Sessions
            .Where(s => s.Id == id && s.Character.UserId == userId)
            .Select(s => new
            {
                s.Id,
                s.CharacterId,
                CharacterName = s.Character.Name,
                Server = s.Character.Server,
                s.Zone,
                s.StartedAt,
                s.EndedAt,
                s.Status
            })
            .FirstOrDefaultAsync();

        if (session is null) return NotFound();

        var eventsQuery = _db.SessionEvents.Where(e => e.SessionId == id);

        var totalDamage = await eventsQuery
            .Where(e => DamageTypes.Contains(e.EventType))
            .SumAsync(e => e.Value);

        var gilEarned = await eventsQuery
            .Where(e => e.EventType == SessionEventType.GilGain)
            .SumAsync(e => e.Value);

        var mobsKilled = await eventsQuery
            .Where(e => e.EventType == SessionEventType.MobKill)
            .CountAsync();

        var itemsDropped = await eventsQuery
            .Where(e => e.EventType == SessionEventType.ItemDrop)
            .CountAsync();

        var expGained = await eventsQuery
            .Where(e => e.EventType == SessionEventType.ExpGain)
            .SumAsync(e => e.Value);

        var healingDone = await eventsQuery
            .Where(e => e.EventType == SessionEventType.Healing)
            .SumAsync(e => e.Value);

        var eventCount = await eventsQuery.CountAsync();

        var durationSeconds = session.EndedAt.HasValue
            ? (session.EndedAt.Value - session.StartedAt).TotalSeconds
            : 0;

        var dpsAverage = durationSeconds > 0 ? totalDamage / durationSeconds : 0;

        var durationHours = durationSeconds / 3600.0;
        var gilPerHour = durationHours > 0 ? gilEarned / durationHours : 0;

        return Ok(new SessionDetailResponse
        {
            Id = session.Id,
            CharacterId = session.CharacterId,
            CharacterName = session.CharacterName,
            Server = session.Server,
            Zone = session.Zone,
            StartedAt = session.StartedAt,
            EndedAt = session.EndedAt,
            Status = session.Status,
            TotalDamage = totalDamage,
            GilEarned = gilEarned,
            MobsKilled = mobsKilled,
            ItemsDropped = itemsDropped,
            DpsAverage = dpsAverage,
            GilPerHour = gilPerHour,
            ExpGained = expGained,
            HealingDone = healingDone,
            EventCount = eventCount
        });
    }

    [HttpGet("{id:guid}/events")]
    public async Task<IActionResult> GetEvents(
        Guid id,
        [FromQuery] string? eventType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        var userId = GetUserId();

        var session = await _db.Sessions
            .Where(s => s.Id == id && s.Character.UserId == userId)
            .FirstOrDefaultAsync();

        if (session is null) return NotFound();

        var query = _db.SessionEvents.Where(e => e.SessionId == id);

        if (!string.IsNullOrEmpty(eventType) && Enum.TryParse<SessionEventType>(eventType, true, out var parsed))
            query = query.Where(e => e.EventType == parsed);

        var totalCount = await query.CountAsync();

        var events = await query
            .OrderBy(e => e.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new SessionEventResponse
            {
                Id = e.Id,
                EventType = e.EventType.ToString(),
                Timestamp = e.Timestamp,
                Source = e.Source,
                Target = e.Target,
                Value = e.Value,
                Ability = e.Ability,
                ItemId = e.ItemId,
                Zone = e.Zone
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, events });
    }

    [HttpGet("{id:guid}/timeline")]
    public async Task<IActionResult> GetTimeline(
        Guid id,
        [FromQuery] int bucketMinutes = 1)
    {
        var userId = GetUserId();

        var session = await _db.Sessions
            .Where(s => s.Id == id && s.Character.UserId == userId)
            .FirstOrDefaultAsync();

        if (session is null) return NotFound();

        // NOTE: This loads all session events into memory for grouping.
        // For long sessions with many events, this could be optimized with
        // a database-level aggregation or pre-computed time buckets.
        var events = await _db.SessionEvents
            .Where(e => e.SessionId == id)
            .Select(e => new { e.EventType, e.Timestamp, e.Value })
            .ToListAsync();

        var bucketSize = TimeSpan.FromMinutes(bucketMinutes);
        var sessionStart = session.StartedAt;

        var timeline = events
            .GroupBy(e =>
            {
                var offset = e.Timestamp - sessionStart;
                var bucketIndex = (long)(offset.TotalMinutes / bucketMinutes);
                return sessionStart.Add(TimeSpan.FromMinutes(bucketIndex * bucketMinutes));
            })
            .OrderBy(g => g.Key)
            .Select(g => new SessionTimelineEntry
            {
                Timestamp = g.Key,
                Damage = g.Where(e => DamageTypes.Contains(e.EventType)).Sum(e => e.Value),
                Healing = g.Where(e => e.EventType == SessionEventType.Healing).Sum(e => e.Value),
                Gil = g.Where(e => e.EventType == SessionEventType.GilGain).Sum(e => e.Value),
                Kills = g.Count(e => e.EventType == SessionEventType.MobKill)
            })
            .ToList();

        return Ok(timeline);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();

        var session = await _db.Sessions
            .Where(s => s.Id == id && s.Character.UserId == userId)
            .FirstOrDefaultAsync();

        if (session is null) return NotFound();

        _db.Sessions.Remove(session);
        await _db.SaveChangesAsync();

        return Ok(new { message = "Session deleted." });
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
