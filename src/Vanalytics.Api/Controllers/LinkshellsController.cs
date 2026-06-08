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
}
