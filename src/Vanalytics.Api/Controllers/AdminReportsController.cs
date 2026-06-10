using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Messaging.Models;
using Soverance.Messaging.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/reports")]
[Authorize(Roles = "Admin")]
public class AdminReportsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly IMessagingUserResolver _users;

    public AdminReportsController(VanalyticsDbContext db, IMessagingUserResolver users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeReviewed = false)
    {
        var query = _db.Set<ConversationReport>().AsQueryable();
        if (!includeReviewed) query = query.Where(r => r.Status == ReportStatus.Open);

        var reports = await query
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.ReporterUserId,
                r.ConversationId,
                r.MessageId,
                r.Note,
                r.Status,
                r.CreatedAt,
            })
            .ToListAsync();

        // Resolve reporter identities.
        var infos = await _users.ResolveUsersAsync(reports.Select(r => r.ReporterUserId));

        // Resolve the reported messages (body + sender) for reports that target a specific message.
        var messageIds = reports.Where(r => r.MessageId.HasValue).Select(r => r.MessageId!.Value).ToList();
        var messages = await _db.Set<Message>()
            .Where(m => messageIds.Contains(m.Id))
            .Select(m => new { m.Id, m.SenderId, m.Body })
            .ToListAsync();
        var messageMap = messages.ToDictionary(m => m.Id);

        var items = reports.Select(r => new
        {
            r.Id,
            reporter = infos.TryGetValue(r.ReporterUserId, out var u)
                ? new { id = u.UserId, username = (string?)u.Username, displayName = u.DisplayName }
                : new { id = r.ReporterUserId, username = (string?)null, displayName = (string?)null },
            r.ConversationId,
            reportedMessage = r.MessageId.HasValue && messageMap.TryGetValue(r.MessageId.Value, out var m)
                ? new { id = (long?)m.Id, senderId = (Guid?)m.SenderId, body = (string?)m.Body }
                : null,
            r.Note,
            r.Status,
            r.CreatedAt,
        });

        return Ok(new { items });
    }

    [HttpPost("{id:long}/reviewed")]
    public async Task<IActionResult> MarkReviewed(long id)
    {
        var report = await _db.Set<ConversationReport>().FirstOrDefaultAsync(r => r.Id == id);
        if (report == null) return NotFound();
        report.Status = ReportStatus.Reviewed;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
