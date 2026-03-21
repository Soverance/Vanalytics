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
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstOrDefaultAsync(c =>
                c.Server == server &&
                c.Name == name &&
                c.IsPublic);

        if (character is null) return NotFound();

        return Ok(CharactersController.MapToDetail(character));
    }
}
