using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Api.Services;
using Vanalytics.Api.Validation;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly TokenService _tokenService;
    private readonly AuthResponseService _authResponseService;
    private readonly LoginRateLimiter _loginRateLimiter;

    public AuthController(VanalyticsDbContext db, TokenService tokenService, AuthResponseService authResponseService, LoginRateLimiter loginRateLimiter)
    {
        _db = db;
        _tokenService = tokenService;
        _authResponseService = authResponseService;
        _loginRateLimiter = loginRateLimiter;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        if (_loginRateLimiter.IsLockedOut(ip))
            return StatusCode(429, new { message = "Too many failed login attempts. Please try again later." });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user is null || user.PasswordHash is null)
        {
            _loginRateLimiter.RecordFailure(ip);
            return Unauthorized(new { message = "Invalid credentials" });
        }

        if (!PasswordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            _loginRateLimiter.RecordFailure(ip);
            return Unauthorized(new { message = "Invalid credentials" });
        }

        _loginRateLimiter.ClearFailures(ip);
        return Ok(await _authResponseService.GenerateAuthResponseAsync(_db, user));
    }

    // Note: Spec says refresh requires JWT, but this is intentionally unauthenticated.
    // The whole point of refresh is that the access token may be expired. The refresh
    // token itself serves as the authentication credential for this endpoint.
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        var refreshToken = await _db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t =>
                t.Token == request.RefreshToken &&
                !t.IsRevoked &&
                t.ExpiresAt > DateTimeOffset.UtcNow);

        if (refreshToken is null)
            return Unauthorized(new { message = "Invalid or expired refresh token" });

        // Revoke old token — the SaveChangesAsync inside GenerateAuthResponseAsync
        // will persist both the revocation and the new refresh token in one round trip.
        refreshToken.IsRevoked = true;

        return Ok(await _authResponseService.GenerateAuthResponseAsync(_db, refreshToken.User));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        return Ok(new UserProfileResponse
        {
            Id = user.Id,
            Email = user.Email,
            Username = user.Username,
            DisplayName = user.DisplayName,
            HasApiKey = user.ApiKey is not null,
            ApiKeyCreatedAt = user.ApiKeyCreatedAt,
            Role = user.Role.ToString(),
            AvatarUrl = user.AvatarUrl,
            OAuthProvider = user.OAuthProvider,
            DefaultServer = user.DefaultServer,
            CreatedAt = user.CreatedAt
        });
    }

    [Authorize]
    [HttpPut("me/server")]
    public async Task<IActionResult> UpdateDefaultServer([FromBody] UpdateDefaultServerRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        user.DefaultServer = string.IsNullOrWhiteSpace(request.Server) ? null : request.Server.Trim();
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { defaultServer = user.DefaultServer });
    }

    [Authorize]
    [HttpPut("me/display-name")]
    public async Task<IActionResult> UpdateDisplayName([FromBody] UpdateDisplayNameRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        var trimmed = request.DisplayName?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            user.DisplayName = null;
        }
        else
        {
            if (!DisplayNameValidator.IsValid(trimmed, out var error))
                return BadRequest(new { message = error });
            user.DisplayName = trimmed;
        }

        user.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { displayName = user.DisplayName });
    }
}
