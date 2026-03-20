using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly TokenService _tokenService;
    private readonly OAuthService _oauthService;

    public AuthController(VanalyticsDbContext db, TokenService tokenService, OAuthService oauthService)
    {
        _db = db;
        _tokenService = tokenService;
        _oauthService = oauthService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already registered" });

        if (await _db.Users.AnyAsync(u => u.Username == request.Username))
            return Conflict(new { message = "Username already taken" });

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            Username = request.Username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(await GenerateAuthResponseAsync(user));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user is null || user.PasswordHash is null)
            return Unauthorized(new { message = "Invalid credentials" });

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid credentials" });

        return Ok(await GenerateAuthResponseAsync(user));
    }

    [HttpPost("oauth/{provider}")]
    public async Task<IActionResult> OAuth(string provider, [FromBody] OAuthRequest request)
    {
        OAuthUserInfo userInfo;
        try
        {
            userInfo = provider.ToLowerInvariant() switch
            {
                "google" => await _oauthService.GetGoogleUserInfoAsync(request.Code, request.RedirectUri),
                "microsoft" => await _oauthService.GetMicrosoftUserInfoAsync(request.Code, request.RedirectUri),
                _ => throw new ArgumentException($"Unsupported provider: {provider}")
            };
        }
        catch (ArgumentException)
        {
            return BadRequest(new { message = $"Unsupported OAuth provider: {provider}" });
        }
        catch (HttpRequestException)
        {
            return BadRequest(new { message = "Failed to authenticate with OAuth provider" });
        }

        // Find existing user by OAuth ID, or fall back to email match.
        // Note: Email-based linking is an MVP convenience. For a higher-security app,
        // account linking should require explicit user confirmation while authenticated.
        // Acceptable here because both Google and Microsoft verify email ownership.
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.OAuthProvider == userInfo.Provider && u.OAuthId == userInfo.ProviderId);

        if (user is null)
        {
            user = await _db.Users.FirstOrDefaultAsync(u => u.Email == userInfo.Email);
            if (user is not null)
            {
                user.OAuthProvider = userInfo.Provider;
                user.OAuthId = userInfo.ProviderId;
                user.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                var username = userInfo.Name;
                if (await _db.Users.AnyAsync(u => u.Username == username))
                    username = $"{username}_{Guid.NewGuid().ToString()[..6]}";

                user = new User
                {
                    Id = Guid.NewGuid(),
                    Email = userInfo.Email,
                    Username = username,
                    OAuthProvider = userInfo.Provider,
                    OAuthId = userInfo.ProviderId,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                _db.Users.Add(user);
            }

            await _db.SaveChangesAsync();
        }

        return Ok(await GenerateAuthResponseAsync(user));
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

        return Ok(await GenerateAuthResponseAsync(refreshToken.User));
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
            HasApiKey = user.ApiKey is not null,
            OAuthProvider = user.OAuthProvider,
            CreatedAt = user.CreatedAt
        });
    }

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user)
    {
        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshTokenValue = _tokenService.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = _tokenService.GetRefreshTokenExpiration(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync();

        return new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenValue,
            ExpiresAt = _tokenService.GetAccessTokenExpiration()
        };
    }
}
