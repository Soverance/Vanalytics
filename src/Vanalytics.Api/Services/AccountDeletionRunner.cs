using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

/// <summary>
/// Performs account deletions off the request thread. Each user is "claimed" with a conditional
/// update on their <c>AccountDeletionRequest</c> row, so double-clicks, the sweep job and a
/// second replica can't delete the same account twice at once.
///
/// Characters are deleted one at a time (each cascades through its own data) before the user
/// row, so no single transaction has to hold a heavy account's whole history.
/// </summary>
public class AccountDeletionRunner(IServiceScopeFactory scopeFactory, ILogger<AccountDeletionRunner> logger)
{
    /// <summary>A claim older than this is assumed dead (crashed worker) and can be re-claimed.</summary>
    public static readonly TimeSpan StaleClaimThreshold = TimeSpan.FromMinutes(30);

    /// <summary>After a failure, the sweep waits this long before retrying automatically.
    /// An admin clicking Delete again retries immediately.</summary>
    public static readonly TimeSpan FailureBackoff = TimeSpan.FromHours(1);

    private static readonly TimeSpan CommandTimeout = TimeSpan.FromMinutes(10);

    /// <summary>Fire-and-forget deletion of one user (admin path).</summary>
    public void Start(Guid userId) => _ = Task.Run(() => DeleteUserAsync(userId, CancellationToken.None));

    /// <summary>Deletes every account whose grace period has passed. Called by the sweep job.</summary>
    public async Task<int> ProcessDueAsync(CancellationToken ct)
    {
        List<Guid> due;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var now = DateTimeOffset.UtcNow;
            var staleBefore = now - StaleClaimThreshold;
            var retryBefore = now - FailureBackoff;
            due = await db.AccountDeletionRequests
                .Where(r => r.ScheduledFor <= now
                    && (r.ProcessingStartedAt == null || r.ProcessingStartedAt < staleBefore)
                    && (r.LastErrorAt == null || r.LastErrorAt < retryBefore))
                .Select(r => r.UserId)
                .ToListAsync(ct);
        }

        var deleted = 0;
        foreach (var id in due)
        {
            if (ct.IsCancellationRequested) break;
            if (await DeleteUserAsync(id, ct)) deleted++;
        }
        return deleted;
    }

    /// <summary>Claims and deletes one user. Returns false if the claim failed (not due, being
    /// processed elsewhere, or cancelled) or the delete threw (error recorded on the row).</summary>
    public async Task<bool> DeleteUserAsync(Guid userId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Database.SetCommandTimeout(CommandTimeout);

        var now = DateTimeOffset.UtcNow;
        var staleBefore = now - StaleClaimThreshold;
        var claimed = await db.AccountDeletionRequests
            .Where(r => r.UserId == userId
                && r.ScheduledFor <= now
                && (r.ProcessingStartedAt == null || r.ProcessingStartedAt < staleBefore))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ProcessingStartedAt, now), ct);
        if (claimed == 0) return false;

        try
        {
            var characterIds = await db.Characters
                .Where(c => c.UserId == userId)
                .Select(c => c.Id)
                .ToListAsync(ct);

            foreach (var characterId in characterIds)
                await db.Characters.Where(c => c.Id == characterId).ExecuteDeleteAsync(ct);

            // Cascades the remaining user-scoped data and the AccountDeletionRequest row itself.
            await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(ct);

            logger.LogInformation("Deleted account {UserId} ({CharacterCount} characters)", userId, characterIds.Count);

            // Stored avatars only exist for SAML users (Graph photo copies); OAuth avatars are
            // provider URLs. Best-effort: the account is already gone, so a failure here is
            // logged rather than reported as a failed deletion.
            var avatarStore = scope.ServiceProvider.GetService<AzureBlobAvatarStore>();
            if (avatarStore is not null)
            {
                try { await avatarStore.DeleteAvatarAsync(userId, CancellationToken.None); }
                catch (Exception ex) { logger.LogWarning(ex, "Failed to delete avatar blob for deleted account {UserId}", userId); }
            }

            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Account deletion failed for {UserId}", userId);
            try
            {
                var failedAt = DateTimeOffset.UtcNow;
                var message = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
                await db.AccountDeletionRequests
                    .Where(r => r.UserId == userId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(r => r.ProcessingStartedAt, (DateTimeOffset?)null)
                        .SetProperty(r => r.LastError, message)
                        .SetProperty(r => r.LastErrorAt, failedAt), CancellationToken.None);
            }
            catch (Exception inner) { logger.LogError(inner, "Failed to record account deletion error for {UserId}", userId); }
            return false;
        }
    }
}

/// <summary>Periodically deletes accounts whose grace period has ended.</summary>
public class AccountDeletionJob(AccountDeletionRunner runner, ILogger<AccountDeletionJob> logger) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var deleted = await runner.ProcessDueAsync(stoppingToken);
                if (deleted > 0) logger.LogInformation("Account deletion sweep removed {Count} accounts", deleted);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Account deletion sweep failed");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }
}
