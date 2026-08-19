using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Achievements;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api")]
public class AchievementsController(AchievementRescoreRunner rescoreRunner, VanalyticsDbContext db) : ControllerBase
{
    /// <summary>
    /// Returns the public achievement scoring rubric (version + category list).
    /// No authentication required — this is "how scoring works" documentation.
    /// [AllowAnonymous] is explicit because other controllers in this app use [Authorize]
    /// at the class level; no global fallback policy exists, but being explicit avoids
    /// confusion if a global policy is ever added.
    /// </summary>
    [HttpGet("achievements/rubric")]
    [AllowAnonymous]
    public IActionResult Rubric() =>
        Ok(new { version = AchievementRubric.Version, categories = AchievementRubric.Categories });

    /// <summary>Admin-only: start a background rescore of every character + linkshell.
    /// Returns 202 immediately, or 409 if a (non-stalled) run is already active.</summary>
    [HttpPost("admin/achievements/rescore")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Rescore(CancellationToken ct)
    {
        var result = await rescoreRunner.TryStartAsync(ct);
        return result == RescoreStartResult.AlreadyRunning
            ? Conflict(new { error = "A rescore is already running." })
            : Accepted(new { started = true });
    }

    /// <summary>Admin-only: live progress of the current/last rescore run (poll-friendly).</summary>
    [HttpGet("admin/achievements/rescore-status")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AchievementRescoreStatus>> RescoreStatus(CancellationToken ct)
    {
        var s = await db.AchievementRescoreStates.FirstOrDefaultAsync(x => x.Id == 1, ct);
        if (s is null)
            return Ok(new AchievementRescoreStatus(false, false, 0, 0, 0, null, null, null, null));

        var stalled = AchievementRescoreRunner.IsStalled(s, DateTimeOffset.UtcNow);
        return Ok(new AchievementRescoreStatus(
            IsRunning: s.IsRunning && !stalled,
            IsStalled: stalled,
            Processed: s.Processed, Total: s.Total, Failed: s.Failed,
            StartedAt: s.StartedAt, FinishedAt: s.FinishedAt,
            LastError: s.LastError, LastErrorAt: s.LastErrorAt));
    }

    /// <summary>
    /// Admin-only scoring-freshness readout: total characters vs. how many are scored at the
    /// current rubric version, so the admin can tell whether a backfill (rescore) is needed.
    /// </summary>
    [HttpGet("admin/achievements/status")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AchievementAdminStatus>> Status(CancellationToken ct)
    {
        int total = await db.Characters.CountAsync(ct);
        int scoredAtCurrent = await db.CharacterAchievements
            .CountAsync(a => a.RubricVersion == AchievementRubric.Version, ct);

        DateTimeOffset? oldest = null, last = null;
        if (await db.CharacterAchievements.AnyAsync(ct))
        {
            oldest = await db.CharacterAchievements.MinAsync(a => a.ComputedAt, ct);
            last = await db.CharacterAchievements.MaxAsync(a => a.ComputedAt, ct);
        }

        return Ok(new AchievementAdminStatus(
            CurrentRubricVersion: AchievementRubric.Version,
            TotalCharacters: total,
            ScoredAtCurrentVersion: scoredAtCurrent,
            NeedsRescore: total - scoredAtCurrent,
            OldestComputedAt: oldest,
            LastComputedAt: last));
    }
}
