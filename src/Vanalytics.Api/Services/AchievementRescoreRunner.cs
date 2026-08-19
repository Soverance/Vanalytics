using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Controllers;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public enum RescoreStartResult { Started, AlreadyRunning }

/// <summary>
/// Runs the admin achievement-rescore batch as a background job on its own DI scope, so the HTTP
/// request returns immediately and the run survives long durations. Progress is written to the
/// single-row <see cref="AchievementRescoreState"/> so either replica's status poll agrees.
/// </summary>
public class AchievementRescoreRunner(IServiceScopeFactory scopeFactory, ILogger<AchievementRescoreRunner> logger)
{
    /// <summary>A run whose heartbeat is older than this is treated as dead (restartable).</summary>
    public static readonly TimeSpan StallThreshold = TimeSpan.FromSeconds(90);

    /// <summary>Persist progress every N characters to avoid a DB write per character.</summary>
    private const int ProgressFlushEvery = 20;

    /// <summary>Also flush the heartbeat if this much wall-clock time has passed since the last
    /// flush, even if fewer than <see cref="ProgressFlushEvery"/> characters have completed. A
    /// heavy character (or a slow batch of 20) must not let <c>HeartbeatAt</c> go stale and trip
    /// <see cref="IsStalled"/> on another replica, which would launch a duplicate run.</summary>
    private static readonly TimeSpan HeartbeatMaxInterval = TimeSpan.FromSeconds(30);

    internal static bool CanStart(AchievementRescoreState? state, DateTimeOffset now) =>
        state is null || !state.IsRunning || state.HeartbeatAt is null || now - state.HeartbeatAt > StallThreshold;

    internal static bool IsStalled(AchievementRescoreState state, DateTimeOffset now) =>
        state.IsRunning && (state.HeartbeatAt is null || now - state.HeartbeatAt > StallThreshold);

    /// <summary>Best-effort start guard + launch. Returns AlreadyRunning if a fresh run is active.</summary>
    public async Task<RescoreStartResult> TryStartAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var state = await db.AchievementRescoreStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
            if (!CanStart(state, now)) return RescoreStartResult.AlreadyRunning;

            state ??= db.AchievementRescoreStates.Add(new AchievementRescoreState { Id = 1 }).Entity;
            state.IsRunning = true;
            state.StartedAt = now;
            state.FinishedAt = null;
            state.HeartbeatAt = now;
            state.Total = 0;
            state.Processed = 0;
            state.Failed = 0;
            state.LastError = null;
            state.LastErrorAt = null;
            await db.SaveChangesAsync(ct);
        }

        // Fire-and-forget on a fresh scope; do NOT capture the request's scoped DbContext.
        _ = Task.Run(() => RunAsync(CancellationToken.None));
        return RescoreStartResult.Started;
    }

    /// <summary>The full background run: preload catalog, recompute every character (isolated),
    /// re-aggregate every linkshell, mark finished. Swallows/records fatal errors so IsRunning clears.</summary>
    internal async Task RunAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var svc = scope.ServiceProvider.GetRequiredService<AchievementRecomputeService>();

            var catalog = await CharactersController.LoadUltimateWeaponCatalogAsync(db);
            var ids = await db.Characters.Select(c => c.Id).ToListAsync(ct);

            // Each character recomputes on its own fresh DI scope/DbContext. This keeps a
            // character that dirties its context and then throws from ever being flushed by
            // the outer state-row SaveChangesAsync (which runs on `db`, outside the per-
            // character try/catch in ExecuteBatchAsync), and prevents tracked-entity buildup
            // on a single context across the whole roster.
            await ExecuteBatchAsync(db, ids, async id =>
            {
                using var charScope = scopeFactory.CreateScope();
                var charSvc = charScope.ServiceProvider.GetRequiredService<AchievementRecomputeService>();
                await charSvc.RecomputeCharacterAsync(id, catalog, ct);
            }, DateTimeOffset.UtcNow, ct);

            // Load the state row once and reuse the SAME tracked instance for both the
            // throttled in-loop heartbeat and the finish block below, so we never have two
            // AchievementRescoreState instances tracked on this context at once.
            var lsIds = await db.Linkshells.Select(l => l.Id).ToListAsync(ct);
            var state = await db.AchievementRescoreStates.FirstAsync(s => s.Id == 1, ct);
            var lastFlush = DateTimeOffset.UtcNow;
            foreach (var lsId in lsIds)
            {
                await svc.RecomputeLinkshellAsync(lsId, ct);

                if (DateTimeOffset.UtcNow - lastFlush > HeartbeatMaxInterval)
                {
                    state.HeartbeatAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    lastFlush = DateTimeOffset.UtcNow;
                }
            }

            state.IsRunning = false;
            state.FinishedAt = DateTimeOffset.UtcNow;
            state.HeartbeatAt = state.FinishedAt;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Achievement rescore batch failed");
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                var state = await db.AchievementRescoreStates.FirstOrDefaultAsync(s => s.Id == 1, ct);
                if (state is not null)
                {
                    state.IsRunning = false;
                    state.FinishedAt = DateTimeOffset.UtcNow;
                    state.LastError = ex.Message;
                    state.LastErrorAt = state.FinishedAt;
                    await db.SaveChangesAsync(ct);
                }
            }
            catch (Exception inner) { logger.LogError(inner, "Failed to record rescore fatal error"); }
        }
    }

    /// <summary>Per-character loop with error isolation + throttled progress persistence.
    /// Updates the Id=1 state row on <paramref name="db"/>; caller owns start/finish flags.</summary>
    internal static async Task ExecuteBatchAsync(
        VanalyticsDbContext db, IReadOnlyList<Guid> ids, Func<Guid, Task> recomputeOne,
        DateTimeOffset now, CancellationToken ct)
    {
        var state = await db.AchievementRescoreStates.FirstAsync(s => s.Id == 1, ct);
        state.Total = ids.Count;
        state.Processed = 0;
        state.Failed = 0;
        state.HeartbeatAt = now;
        await db.SaveChangesAsync(ct);
        var lastFlush = DateTimeOffset.UtcNow;

        for (int i = 0; i < ids.Count; i++)
        {
            try
            {
                await recomputeOne(ids[i]);
                state.Processed++;
            }
            catch (Exception ex)
            {
                state.Failed++;
                state.LastError = ex.Message;
                state.LastErrorAt = DateTimeOffset.UtcNow;
            }

            if ((i + 1) % ProgressFlushEvery == 0 || i == ids.Count - 1 || DateTimeOffset.UtcNow - lastFlush > HeartbeatMaxInterval)
            {
                state.HeartbeatAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                lastFlush = DateTimeOffset.UtcNow;
            }
        }
    }
}
