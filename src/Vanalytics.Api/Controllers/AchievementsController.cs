using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vanalytics.Api.Services;
using Vanalytics.Core.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api")]
public class AchievementsController(AchievementRecomputeService recompute) : ControllerBase
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
}
