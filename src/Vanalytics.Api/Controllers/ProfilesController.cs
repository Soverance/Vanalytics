using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.GearSets;
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

    private async Task<Guid?> ResolvePublicCharacterIdAsync(string server, string name) =>
        await _db.Characters
            .Where(c => c.Server == server && c.Name == name && c.IsPublic)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync();

    [HttpGet("{server}/{name}/progression")]
    public async Task<IActionResult> GetPublicProgression(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadProgressionAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/collection")]
    public async Task<IActionResult> GetPublicCollection(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadCollectionAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/titles")]
    public async Task<IActionResult> GetPublicTitles(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadTitlesAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/missions")]
    public async Task<IActionResult> GetPublicMissions(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadMissionsAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/relics")]
    public async Task<IActionResult> GetPublicRelics(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadRelicsAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/gear-sets")]
    public async Task<IActionResult> GetPublicGearSets(string server, string name)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        return Ok(await CharactersController.LoadGearSetsAsync(_db, id.Value));
    }

    [HttpGet("{server}/{name}/gear-sets/{setId:long}")]
    public async Task<IActionResult> GetPublicGearSet(string server, string name, long setId)
    {
        var id = await ResolvePublicCharacterIdAsync(server, name);
        if (id is null) return NotFound();
        var detail = await CharactersController.LoadGearSetAsync(_db, id.Value, setId);
        return detail is null ? NotFound() : Ok(detail);
    }
}
