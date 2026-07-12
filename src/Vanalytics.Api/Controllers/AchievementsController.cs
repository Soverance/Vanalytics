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
public class AchievementsController(AchievementRecomputeService recompute, VanalyticsDbContext db) : ControllerBase
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

    /// <summary>
    /// Admin-only batch rescore: recomputes CharacterAchievement for every character
    /// and re-aggregates every linkshell. Returns the number of characters recomputed.
    /// Role attribute mirrors AdminUsersController / AdminEconomyController exactly.
    /// </summary>
    [HttpPost("admin/achievements/rescore")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Rescore(CancellationToken ct)
    {
        var n = await recompute.RecomputeAllAsync(ct);
        return Ok(new { recomputed = n });
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
