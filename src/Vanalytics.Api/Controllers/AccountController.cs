using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

/// <summary>Self-service account deletion: request (7-day grace period), check status, cancel.</summary>
[ApiController]
[Route("api/account/deletion")]
[Authorize]
public class AccountController(VanalyticsDbContext db, AccountDeletionService deletions) : ControllerBase
{
    public record RequestDeletionBody(string? ConfirmUsername);
    public record DeletionStatusResponse(bool Pending, DateTimeOffset? ScheduledFor);

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> Status()
    {
        var request = await db.AccountDeletionRequests.AsNoTracking()
            .FirstOrDefaultAsync(r => r.UserId == CurrentUserId);
        return Ok(new DeletionStatusResponse(request is not null, request?.ScheduledFor));
    }

    [HttpPost]
    public async Task<IActionResult> RequestDeletion([FromBody] RequestDeletionBody body)
    {
        var (outcome, request) = await deletions.RequestSelfDeletionAsync(CurrentUserId, body.ConfirmUsername);
        return outcome switch
        {
            DeletionRequestOutcome.Scheduled or DeletionRequestOutcome.AlreadyPending =>
                Ok(new DeletionStatusResponse(true, request!.ScheduledFor)),
            DeletionRequestOutcome.UsernameMismatch =>
                BadRequest(new { message = "The username you typed doesn't match your account." }),
            DeletionRequestOutcome.NotAllowed =>
                BadRequest(new { message = "Admin accounts can't be deleted this way. Change the role first." }),
            _ => NotFound(),
        };
    }

    [HttpDelete]
    public async Task<IActionResult> Cancel()
    {
        return await deletions.CancelAsync(CurrentUserId) switch
        {
            DeletionCancelOutcome.Cancelled => Ok(new DeletionStatusResponse(false, null)),
            DeletionCancelOutcome.AlreadyProcessing =>
                Conflict(new { message = "Deletion has already started and can't be cancelled." }),
            _ => Ok(new DeletionStatusResponse(false, null)),
        };
    }
}
