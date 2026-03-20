using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/keys")]
[Authorize]
public class KeysController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public KeysController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        // Generate a random key, return it to the user, but store only the hash.
        // The plaintext key is only shown once — on generation.
        var rawKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        user.ApiKey = BCrypt.Net.BCrypt.HashPassword(rawKey);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiKeyResponse
        {
            ApiKey = rawKey,
            GeneratedAt = user.UpdatedAt
        });
    }

    [HttpDelete]
    public async Task<IActionResult> Revoke()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        user.ApiKey = null;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
