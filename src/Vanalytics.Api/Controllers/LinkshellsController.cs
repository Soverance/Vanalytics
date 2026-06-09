using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.DTOs;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LinkshellsController(VanalyticsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetDirectory([FromQuery] string? server)
    {
        var query = db.Linkshells.Where(l => l.MemberCount > 0);
        if (!string.IsNullOrEmpty(server))
            query = query.Where(l => l.Server == server);

        var items = await query
            .Select(l => new LinkshellListItem
            {
                Name = l.Name,
                Server = l.Server,
                ColorRgb = l.ColorRgb,
                MemberCount = l.MemberCount,
                PublicMemberCount = l.Memberships.Count(m => m.IsCurrent && m.Character.IsPublic),
                LastActiveAt = l.LastSeenAt,
            })
            .ToListAsync();

        return Ok(items.OrderByDescending(i => i.MemberCount).ThenBy(i => i.Name).ToList());
    }

    // Name is the URL segment; an FFXI linkshell name never contains '/', so the
    // two-segment {server}/{name} template resolves it unambiguously.
    [HttpGet("{server}/{name}")]
    public async Task<IActionResult> GetProfile(string server, string name)
    {
        // Names are effectively unique per server; the deterministic tiebreak
        // (most current members, then most recently seen) keeps resolution safe
        // even in the theoretical duplicate-name case. MemberCount > 0 means the
        // LS has current members; an all-former LS is treated as not found.
        var ls = await db.Linkshells
            .Where(l => l.Server == server && l.Name == name && l.MemberCount > 0)
            .OrderByDescending(l => l.MemberCount)
            .ThenByDescending(l => l.LastSeenAt)
            .FirstOrDefaultAsync();

        if (ls is null) return NotFound();

        // Public current members, with their active job. AsSplitQuery avoids the
        // cartesian blow-up that timed out the public character profile.
        var publicMembers = await db.LinkshellMemberships
            .Where(m => m.LinkshellId == ls.Id && m.IsCurrent && m.Character.IsPublic)
            .Include(m => m.Character).ThenInclude(c => c.Jobs)
            .AsSplitQuery()
            .ToListAsync();

        // Sort on the LinkshellRank enum value itself (Leader=2, Sackholder=1,
        // Member=0) BEFORE stringifying, so the order can't silently de-sync from
        // the rank names. Name ascending within a rank.
        var rows = publicMembers
            .OrderByDescending(m => (int)m.Rank)
            .ThenBy(m => m.Character.Name)
            .Select(m =>
            {
                var active = m.Character.Jobs.FirstOrDefault(j => j.IsActive);
                return new LinkshellMemberRow
                {
                    Name = m.Character.Name,
                    Rank = m.Rank.ToString(),
                    Job = active?.JobId.ToString(),
                    Level = active?.Level,
                    LastSeen = m.LastSeenAt,
                };
            })
            .ToList();

        return Ok(new LinkshellProfile
        {
            Name = ls.Name,
            Server = ls.Server,
            ColorRgb = ls.ColorRgb,
            MemberCount = ls.MemberCount,
            PublicMemberCount = rows.Count,
            // MemberCount (all current) minus the named public rows = private
            // members. Clamp at 0 so a transient stale read can never render a
            // negative "+N private members".
            PrivateMemberCount = Math.Max(0, ls.MemberCount - rows.Count),
            LastActiveAt = ls.LastSeenAt,
            RecruitmentStatus = "Unknown",
            Members = rows,
        });
    }
}
