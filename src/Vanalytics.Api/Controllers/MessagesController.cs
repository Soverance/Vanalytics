using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Messaging.Models;
using Soverance.Messaging.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/messages")]
public class MessagesController : ControllerBase
{
    private readonly IMessagingService _messaging;
    private readonly IMessagingUserResolver _users;
    private readonly VanalyticsDbContext _db;

    public MessagesController(IMessagingService messaging, IMessagingUserResolver users, VanalyticsDbContext db)
    {
        _messaging = messaging;
        _users = users;
        _db = db;
    }

    public record SendRequest(Guid ToUserId, string Body);
    public record ReportRequest(long? MessageId, string? Note);

    [HttpGet("conversations")]
    public async Task<IActionResult> ListConversations([FromQuery] int limit = 25, [FromQuery] long? beforeTicks = null)
    {
        DateTimeOffset? before = beforeTicks.HasValue
            ? new DateTimeOffset(beforeTicks.Value, TimeSpan.Zero) : null;
        var result = await _messaging.ListConversationsAsync(GetUserId(), limit, before);
        var infos = await _users.ResolveUsersAsync(result.Items.Select(i => i.OtherUserId));
        var items = result.Items.Select(i => new
        {
            i.Id,
            other = Project(infos, i.OtherUserId),
            i.LastMessagePreview,
            i.LastMessageAt,
            i.UnreadCount,
        });
        return Ok(new { items, result.HasMore });
    }

    [HttpGet("conversations/{id:int}")]
    public async Task<IActionResult> GetConversation(int id, [FromQuery] int limit = 50, [FromQuery] long? beforeId = null)
    {
        var detail = await _messaging.GetConversationAsync(GetUserId(), id, limit, beforeId);
        if (detail == null) return NotFound();
        var infos = await _users.ResolveUsersAsync(new[] { detail.OtherUserId });
        return Ok(new { detail.Id, other = Project(infos, detail.OtherUserId), detail.Messages, detail.HasMore });
    }

    [HttpPost]
    public async Task<IActionResult> Send([FromBody] SendRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { message = "Message body is required." });
        try
        {
            var result = await _messaging.SendMessageAsync(GetUserId(), request.ToUserId, request.Body);
            if (result.Blocked) return StatusCode(403, new { message = "You can no longer message this user." });
            return Ok(new { result.ConversationId, result.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("conversations/{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var ok = await _messaging.MarkReadAsync(GetUserId(), id);
        return ok ? NoContent() : NotFound();
    }

    [HttpPost("conversations/{id:int}/report")]
    public async Task<IActionResult> Report(int id, [FromBody] ReportRequest request)
    {
        var ok = await _messaging.ReportAsync(GetUserId(), id, request.MessageId, request.Note);
        return ok ? NoContent() : NotFound();
    }

    [HttpPost("/api/users/{id:guid}/block")]
    public async Task<IActionResult> Block(Guid id)
    {
        await _messaging.BlockUserAsync(GetUserId(), id);
        return NoContent();
    }

    [HttpDelete("/api/users/{id:guid}/block")]
    public async Task<IActionResult> Unblock(Guid id)
    {
        await _messaging.UnblockUserAsync(GetUserId(), id);
        return NoContent();
    }

    [HttpGet("blocked")]
    public async Task<IActionResult> ListBlocked()
    {
        var me = GetUserId();
        var blockedIds = await _db.Set<UserBlock>()
            .Where(b => b.BlockerUserId == me)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => b.BlockedUserId)
            .ToListAsync();
        var infos = await _users.ResolveUsersAsync(blockedIds);
        var users = blockedIds.Select(id => Project(infos, id));
        return Ok(new { users });
    }

    private static object Project(Dictionary<Guid, MessagingUserInfo> infos, Guid id) =>
        infos.TryGetValue(id, out var u)
            ? new { id = u.UserId, username = (string?)u.Username, displayName = u.DisplayName, avatarUrl = u.AvatarUrl }
            : new { id, username = (string?)null, displayName = (string?)null, avatarUrl = (string?)null };

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
