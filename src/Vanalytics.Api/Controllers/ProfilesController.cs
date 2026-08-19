using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Messaging.Models;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/profiles")]
public class ProfilesController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly MemorialProfileStore _memorials;

    public ProfilesController(VanalyticsDbContext db, MemorialProfileStore memorials)
    {
        _db = db;
        _memorials = memorials;
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

        if (character is null)
        {
            // Memorial fallback: frozen, hand-authored profiles (never in the DB).
            // DB is checked first, so a real synced character always wins.
            var memorial = _memorials.Find(server, name);
            if (memorial is null) return NotFound();

            var memorialDetail = CharactersController.MapToDetail(memorial.ToCharacter());
            memorialDetail.IsMemorial = true;
            memorialDetail.Dedication = memorial.Dedication;
            return Ok(memorialDetail);
        }

        var detail = CharactersController.MapToDetail(character);
        detail.LinkshellLogoUrl = await CharactersController.LoadActiveLinkshellLogoAsync(_db, character);
        return Ok(detail);
    }

    [HttpGet("{server}/{name}/owner")]
    public async Task<IActionResult> GetPublicProfileOwner(string server, string name)
    {
        var owner = await _db.Characters
            .Where(c => c.Server == server && c.Name == name && c.IsPublic)
            .Select(c => new
            {
                c.User.Id,
                c.User.Username,
                c.User.DisplayName,
                c.User.AvatarUrl,
            })
            .FirstOrDefaultAsync();

        if (owner is null) return NotFound();

        // The auth middleware populates the principal when a valid bearer token is
        // present, even on this anonymous endpoint — so we can read the viewer if
        // they happen to be signed in.
        Guid? viewerId = Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var v)
            ? v : null;

        var canMessage = false;
        if (viewerId is Guid me && me != owner.Id)
        {
            var blocked = await _db.Set<UserBlock>().AnyAsync(b =>
                (b.BlockerUserId == me && b.BlockedUserId == owner.Id) ||
                (b.BlockerUserId == owner.Id && b.BlockedUserId == me));
            canMessage = !blocked;
        }

        return Ok(new CharacterOwnerResponse
        {
            OwnerUserId = owner.Id,
            OwnerUsername = owner.Username,
            OwnerDisplayName = owner.DisplayName,
            OwnerAvatarUrl = owner.AvatarUrl,
            CanMessage = canMessage,
        });
    }

    private async Task<Guid?> ResolvePublicCharacterIdAsync(string server, string name)
    {
        var id = await _db.Characters
            .Where(c => c.Server == server && c.Name == name && c.IsPublic)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync();
        return id ?? _memorials.Find(server, name)?.Id;
    }

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
