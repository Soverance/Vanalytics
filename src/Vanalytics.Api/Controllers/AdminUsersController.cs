using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
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

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
            return BadRequest(new { message = "A valid email address is required" });

        if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length < 3 || request.Username.Length > 64)
            return BadRequest(new { message = "Username must be between 3 and 64 characters" });

        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already in use" });

        if (await _db.Users.AnyAsync(u => u.Username == request.Username))
            return Conflict(new { message = "Username already taken" });

        if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
            role = UserRole.Member;

        var password = GeneratePassword(16);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            Username = request.Username,
            PasswordHash = PasswordHasher.HashPassword(password),
            Role = role,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(new CreateUserResponse
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Username,
            Role = user.Role.ToString(),
            GeneratedPassword = password
        });
    }

    private static string GeneratePassword(int length)
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghjkmnpqrstuvwxyz";
        const string digits = "23456789";
        const string special = "!@#$%&*";
        const string all = upper + lower + digits + special;

        var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        var bytes = new byte[length];
        rng.GetBytes(bytes);

        var chars = new char[length];
        // Guarantee at least one of each category
        chars[0] = upper[bytes[0] % upper.Length];
        chars[1] = lower[bytes[1] % lower.Length];
        chars[2] = digits[bytes[2] % digits.Length];
        chars[3] = special[bytes[3] % special.Length];

        for (int i = 4; i < length; i++)
            chars[i] = all[bytes[i] % all.Length];

        // Shuffle
        for (int i = chars.Length - 1; i > 0; i--)
        {
            var j = bytes[i] % (i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars);
    }
}

public class ChangeRoleRequest
{
    public string Role { get; set; } = string.Empty;
}

public class CreateUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Role { get; set; } = "Member";
}

public class CreateUserResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string GeneratedPassword { get; set; } = string.Empty;
}
