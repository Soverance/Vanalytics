using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public enum DeletionRequestOutcome { Scheduled, AlreadyPending, NotAllowed, UsernameMismatch, NotFound }
public enum DeletionCancelOutcome { Cancelled, NotPending, AlreadyProcessing }

/// <summary>
/// Schedules and cancels account deletions. The heavy delete itself runs in
/// <see cref="AccountDeletionRunner"/>, never on the request thread.
/// </summary>
public class AccountDeletionService(VanalyticsDbContext db)
{
    /// <summary>How long a self-service deletion waits before data is removed. Signing back in
    /// during this window lets the owner cancel. Keep in sync with the privacy policy.</summary>
    public static readonly TimeSpan GracePeriod = TimeSpan.FromDays(7);

    /// <summary>
    /// Self-service request. Requires the typed username to match (case-insensitive). Signs the
    /// user out everywhere and parks their addon API key so the account is locked during the
    /// grace period.
    /// </summary>
    public async Task<(DeletionRequestOutcome Outcome, AccountDeletionRequest? Request)> RequestSelfDeletionAsync(
        Guid userId, string? confirmUsername, CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return (DeletionRequestOutcome.NotFound, null);
        if (user.IsSystemAccount || user.Role == UserRole.Admin) return (DeletionRequestOutcome.NotAllowed, null);

        if (!string.Equals(confirmUsername?.Trim(), user.Username, StringComparison.OrdinalIgnoreCase))
            return (DeletionRequestOutcome.UsernameMismatch, null);

        var existing = await db.AccountDeletionRequests.FirstOrDefaultAsync(r => r.UserId == userId, ct);
        if (existing is not null) return (DeletionRequestOutcome.AlreadyPending, existing);

        var now = DateTimeOffset.UtcNow;
        var request = new AccountDeletionRequest
        {
            UserId = userId,
            RequestedAt = now,
            ScheduledFor = now + GracePeriod,
            RequestedByAdmin = false,
            ParkedApiKey = user.ApiKey,
            ParkedApiKeyLookup = user.ApiKeyLookup,
            ParkedApiKeyCreatedAt = user.ApiKeyCreatedAt,
        };
        db.AccountDeletionRequests.Add(request);

        user.ApiKey = null;
        user.ApiKeyLookup = null;
        user.ApiKeyCreatedAt = null;
        user.UpdatedAt = now;

        await InTransactionAsync(async () =>
        {
            await db.SaveChangesAsync(acceptAllChangesOnSuccess: false, ct);
            await RevokeSessionsAsync(userId, ct);
        }, ct);

        return (DeletionRequestOutcome.Scheduled, request);
    }

    /// <summary>Cancels a pending deletion and gives the addon API key back. Refused once a
    /// worker has started deleting.</summary>
    public async Task<DeletionCancelOutcome> CancelAsync(Guid userId, CancellationToken ct = default)
    {
        var request = await db.AccountDeletionRequests.AsNoTracking().FirstOrDefaultAsync(r => r.UserId == userId, ct);
        if (request is null) return DeletionCancelOutcome.NotPending;

        var cancelled = false;
        await InTransactionAsync(async () =>
        {
            // Conditional delete so a worker claiming the row at the same moment can't race us:
            // whichever side changes the row first wins.
            var staleBefore = DateTimeOffset.UtcNow - AccountDeletionRunner.StaleClaimThreshold;
            var removed = await db.AccountDeletionRequests
                .Where(r => r.UserId == userId && (r.ProcessingStartedAt == null || r.ProcessingStartedAt < staleBefore))
                .ExecuteDeleteAsync(ct);
            cancelled = removed > 0;
            if (!cancelled) return;

            var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
            // If they somehow generated a new key while pending, keep the new one.
            if (user.ApiKey is null && request.ParkedApiKey is not null)
            {
                user.ApiKey = request.ParkedApiKey;
                user.ApiKeyLookup = request.ParkedApiKeyLookup;
                user.ApiKeyCreatedAt = request.ParkedApiKeyCreatedAt;
            }
            user.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(acceptAllChangesOnSuccess: false, ct);
        }, ct);

        return cancelled ? DeletionCancelOutcome.Cancelled : DeletionCancelOutcome.AlreadyProcessing;
    }

    /// <summary>Admin deletion: schedule for now (overriding any pending grace period) and clear
    /// a previous failure so the runner retries. Caller kicks off the runner.</summary>
    public async Task ScheduleImmediateAsync(Guid userId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var request = await db.AccountDeletionRequests.FirstOrDefaultAsync(r => r.UserId == userId, ct);
        if (request is null)
        {
            request = new AccountDeletionRequest { UserId = userId, RequestedAt = now };
            db.AccountDeletionRequests.Add(request);
        }
        request.ScheduledFor = now;
        request.RequestedByAdmin = true;
        request.LastError = null;
        request.LastErrorAt = null;

        await InTransactionAsync(async () =>
        {
            await db.SaveChangesAsync(acceptAllChangesOnSuccess: false, ct);
            await RevokeSessionsAsync(userId, ct);
        }, ct);
    }

    private Task<int> RevokeSessionsAsync(Guid userId, CancellationToken ct) =>
        db.RefreshTokens
            .Where(t => t.UserId == userId && !t.IsRevoked)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsRevoked, true), ct);

    /// <summary>The SQL Server provider uses a retrying execution strategy, which requires manual
    /// transactions to run inside it. Saves inside <paramref name="work"/> must pass
    /// acceptAllChangesOnSuccess: false so a retried attempt re-sends them; changes are accepted
    /// once the whole unit commits.</summary>
    private async Task InTransactionAsync(Func<Task> work, CancellationToken ct)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await work();
            await tx.CommitAsync(ct);
        });
        db.ChangeTracker.AcceptAllChanges();
    }
}
