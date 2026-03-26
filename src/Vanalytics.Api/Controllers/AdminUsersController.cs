using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Vanalytics.Core.DTOs.Admin;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = "Admin")]
public class AdminUsersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public AdminUsersController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var users = await _db.Users
            .Select(u => new AdminUserResponse
            {
                Id = u.Id,
                Email = u.Email,
                Username = u.Username,
                Role = u.Role.ToString(),
                IsSystemAccount = u.IsSystemAccount,
                HasApiKey = u.ApiKey != null,
                OAuthProvider = u.OAuthProvider,
                CharacterCount = _db.Set<Character>().Count(c => c.UserId == u.Id),
                CreatedAt = u.CreatedAt,
                UpdatedAt = u.UpdatedAt,
            })
            .OrderBy(u => u.CreatedAt)
            .ToListAsync();

        return Ok(users);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var user = await _db.Users
            .Where(u => u.Id == id)
            .Select(u => new AdminUserResponse
            {
                Id = u.Id,
                Email = u.Email,
                Username = u.Username,
                Role = u.Role.ToString(),
                IsSystemAccount = u.IsSystemAccount,
                HasApiKey = u.ApiKey != null,
                OAuthProvider = u.OAuthProvider,
                CharacterCount = _db.Set<Character>().Count(c => c.UserId == u.Id),
                CreatedAt = u.CreatedAt,
                UpdatedAt = u.UpdatedAt,
            })
            .FirstOrDefaultAsync();

        if (user is null) return NotFound();
        return Ok(user);
    }

    [HttpPatch("{id:guid}/role")]
    public async Task<IActionResult> ChangeRole(Guid id, [FromBody] ChangeRoleRequest request)
    {
        if (!Enum.TryParse<UserRole>(request.Role, true, out var newRole))
            return BadRequest(new { message = $"Invalid role: {request.Role}. Valid roles: Member, Moderator, Admin" });

        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (user.IsSystemAccount)
            return BadRequest(new { message = "Cannot modify the system administrator account" });

        var currentUserId = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (user.Id.ToString().Equals(currentUserId, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Cannot change your own role" });

        user.Role = newRole;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { user.Id, Role = user.Role.ToString() });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (user.IsSystemAccount)
            return BadRequest(new { message = "Cannot delete the system administrator account" });

        if (user.Role == UserRole.Admin)
            return BadRequest(new { message = "Cannot delete an admin user. Change their role first." });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}

public class ChangeRoleRequest
{
    public string Role { get; set; } = string.Empty;
}
