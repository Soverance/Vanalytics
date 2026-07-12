using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Session;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/session")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class SessionController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly SessionRateLimiter _rateLimiter;

    public SessionController(VanalyticsDbContext db, SessionRateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] SessionStartRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 300 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found" });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // If an active session already exists, mark it as Abandoned. Use the last
        // event timestamp as EndedAt so duration-based stats reflect actual playtime,
        // not the gap between the crash and the next login.
        var activeSession = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (activeSession is not null)
        {
            var lastEventTimestamp = await _db.SessionEvents
                .Where(e => e.SessionId == activeSession.Id)
                .MaxAsync(e => (DateTimeOffset?)e.Timestamp);

            activeSession.Status = SessionStatus.Abandoned;
            activeSession.EndedAt = lastEventTimestamp ?? activeSession.StartedAt;
        }

        var session = new Core.Models.Session
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            StartedAt = DateTimeOffset.UtcNow,
            Zone = request.Zone,
            Status = SessionStatus.Active
        };

        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new { sessionId = session.Id, message = "Session started" });
    }

    [HttpPost("stop")]
    public async Task<IActionResult> Stop([FromBody] SessionStopRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 300 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found" });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var activeSession = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (activeSession is null)
            return NotFound(new { message = "No active session found" });

        activeSession.Status = SessionStatus.Completed;
        activeSession.EndedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Session stopped" });
    }

    [HttpPost("events")]
    public async Task<IActionResult> Events([FromBody] SessionEventsRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 300 requests per hour." });

        if (request.Events.Count > 500)
            return BadRequest(new { message = "Batch size exceeds maximum of 500 events" });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found" });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var activeSession = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (activeSession is null)
            return BadRequest(new { message = "No active session found" });

        var accepted = 0;
        foreach (var entry in request.Events)
        {
            var mapped = MapEvent(entry, activeSession.Id);
            if (mapped is null) continue; // unparseable EventType — skip, don't fail the batch

            _db.SessionEvents.Add(mapped);
            accepted++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { accepted, total = request.Events.Count });
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] SessionImportRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 300 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found" });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Build a completed session dated from the events themselves so a
        // recovered run keeps its real start/end, not the recovery time.
        var session = new Core.Models.Session
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Zone = Truncate(request.Zone, 64),
            Status = SessionStatus.Completed
        };

        var accepted = 0;
        DateTimeOffset? minTs = null;
        DateTimeOffset? maxTs = null;
        foreach (var entry in request.Events)
        {
            var mapped = MapEvent(entry, session.Id);
            if (mapped is null) continue;

            // Ignore default/unset timestamps when bounding the session window.
            if (mapped.Timestamp > DateTimeOffset.MinValue)
            {
                if (minTs is null || mapped.Timestamp < minTs) minTs = mapped.Timestamp;
                if (maxTs is null || mapped.Timestamp > maxTs) maxTs = mapped.Timestamp;
            }

            _db.SessionEvents.Add(mapped);
            accepted++;
        }

        if (accepted == 0)
            return BadRequest(new { message = "No importable events in file" });

        session.StartedAt = minTs ?? DateTimeOffset.UtcNow;
        session.EndedAt = maxTs ?? session.StartedAt;

        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new { sessionId = session.Id, accepted, total = request.Events.Count });
    }

    // Maps an incoming event entry to a SessionEvent, truncating each string to
    // its DB column width. Returns null when the EventType can't be parsed so
    // the caller can skip it. Never throws on over-length input — that's the
    // whole point: one bad line must not sink the batch.
    private static SessionEvent? MapEvent(SessionEventEntry entry, Guid sessionId)
    {
        if (!Enum.TryParse<SessionEventType>(entry.EventType, true, out var eventType))
            return null;

        return new SessionEvent
        {
            SessionId = sessionId,
            EventType = eventType,
            Timestamp = entry.Timestamp,
            Source = Truncate(entry.Source, 64),
            Target = Truncate(entry.Target, 128),
            Value = entry.Value,
            Ability = entry.Ability is null ? null : Truncate(entry.Ability, 128),
            ItemId = entry.ItemId,
            Zone = Truncate(entry.Zone, 64)
        };
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
