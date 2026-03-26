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

        // If an active session already exists, mark it as Abandoned
        var activeSession = await _db.Sessions
            .FirstOrDefaultAsync(s => s.CharacterId == character.Id && s.Status == SessionStatus.Active);

        if (activeSession is not null)
        {
            activeSession.Status = SessionStatus.Abandoned;
            activeSession.EndedAt = DateTimeOffset.UtcNow;
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
            if (!Enum.TryParse<SessionEventType>(entry.EventType, true, out var eventType))
                continue;

            _db.SessionEvents.Add(new SessionEvent
            {
                SessionId = activeSession.Id,
                EventType = eventType,
                Timestamp = entry.Timestamp,
                Source = entry.Source,
                Target = entry.Target,
                Value = entry.Value,
                Ability = entry.Ability,
                ItemId = entry.ItemId,
                Zone = entry.Zone
            });

            accepted++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { accepted, total = request.Events.Count });
    }
}
