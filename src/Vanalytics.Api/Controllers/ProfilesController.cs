using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/profiles")]
public class ProfilesController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ProfilesController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("{server}/{name}")]
    public async Task<IActionResult> GetPublicProfile(string server, string name)
    {
        // Split into one query per collection. A single query with four
        // collection includes produces a cartesian product (jobs × gear ×
        // crafts × skills) that duplicates the wide Character row — including
        // the multi-KB MeritsJson — onto every row, which for data-complete
        // characters exceeds the command timeout. See PublicProfile perf bug.
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .Include(c => c.Skills)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c =>
                c.Server == server &&
                c.Name == name &&
                c.IsPublic);

        if (character is null) return NotFound();

        return Ok(CharactersController.MapToDetail(character));
    }
}
