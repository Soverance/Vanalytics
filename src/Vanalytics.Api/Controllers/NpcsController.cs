using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/npcs")]
public class NpcsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public NpcsController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q = null,
        [FromQuery] bool? monsters = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        if (pageSize > 200) pageSize = 200;
        if (page < 1) page = 1;

        var query = _db.NpcPools.AsQueryable();

        if (!string.IsNullOrEmpty(q))
            query = query.Where(n => n.Name.Contains(q));

        if (monsters.HasValue)
            query = query.Where(n => n.IsMonster == monsters.Value);

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(n => n.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new
            {
                n.PoolId,
                n.Name,
                n.FamilyId,
                n.ModelId,
                n.IsMonster,
                n.ModelData,
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    [HttpGet("{poolId:int}")]
    public async Task<IActionResult> Get(int poolId)
    {
        var npc = await _db.NpcPools
            .Where(n => n.PoolId == poolId)
            .Select(n => new
            {
                n.PoolId,
                n.Name,
                n.PacketName,
                n.FamilyId,
                n.ModelId,
                n.IsMonster,
                n.ModelData,
            })
            .FirstOrDefaultAsync();

        if (npc is null) return NotFound();

        return Ok(npc);
    }
}
