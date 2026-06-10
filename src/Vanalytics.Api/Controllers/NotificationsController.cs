using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Soverance.Messaging.Services;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notifications;
    private readonly IMessagingUserResolver _users;

    public NotificationsController(INotificationService notifications, IMessagingUserResolver users)
    {
        _notifications = notifications;
        _users = users;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int limit = 25,
        [FromQuery] long? beforeId = null,
        [FromQuery] bool unread = false)
    {
        var result = await _notifications.ListAsync(GetUserId(), limit, beforeId, unread);

        // Resolve actor identities so the UI can show real display names (same as the forum).
        var actorInfos = await _users.ResolveUsersAsync(
            result.Items.Where(i => i.ActorUserId.HasValue).Select(i => i.ActorUserId!.Value));

        var items = result.Items.Select(i => new
        {
            i.Id,
            i.Type,
            i.ActorUserId,
            i.TargetUrl,
            i.Snippet,
            i.IsRead,
            i.CreatedAt,
            actor = i.ActorUserId.HasValue && actorInfos.TryGetValue(i.ActorUserId.Value, out var u)
                ? new { username = u.Username, displayName = u.DisplayName, avatarUrl = u.AvatarUrl }
                : null,
        });

        return Ok(new { items, result.HasMore });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        var notifications = await _notifications.GetUnreadCountAsync(GetUserId());
        return Ok(new { notifications, messages = 0 }); // messages wired in Plan B
    }

    [HttpPost("{id}/read")]
    public async Task<IActionResult> MarkRead(long id)
    {
        var ok = await _notifications.MarkReadAsync(GetUserId(), id);
        return ok ? NoContent() : NotFound();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var cleared = await _notifications.MarkAllReadAsync(GetUserId());
        return Ok(new { cleared });
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
