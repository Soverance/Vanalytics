using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AdminUsersControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
                    });
                });
            });

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<User> SeedUserAsync(
        string email, string username, UserRole role = UserRole.Member,
        string? password = "Password123!", bool isSystemAccount = false,
        string? oAuthProvider = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = password is null ? null : PasswordHasher.HashPassword(password),
            Role = role,
            IsSystemAccount = isSystemAccount,
            OAuthProvider = oAuthProvider,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<AuthResponse> LoginAsync(string email, string password)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    private async Task<string> AdminTokenAsync()
    {
        await SeedUserAsync("admin@example.com", "adminuser", UserRole.Admin);
        var auth = await LoginAsync("admin@example.com", "Password123!");
        return auth.AccessToken;
    }

    private async Task<HttpResponseMessage> ResetAsync(string adminToken, Guid userId)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/users/{userId}/reset-password");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        return await _client.SendAsync(req);
    }

    [Fact]
    public async Task ResetPassword_UnknownUser_ReturnsNotFound()
    {
        var token = await AdminTokenAsync();
        var response = await ResetAsync(token, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_SystemAccount_ReturnsBadRequest()
    {
        var token = await AdminTokenAsync();
        var system = await SeedUserAsync("system@example.com", "systemacct", UserRole.Admin, isSystemAccount: true);
        var response = await ResetAsync(token, system.Id);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_OAuthOnlyAccount_ReturnsBadRequest()
    {
        var token = await AdminTokenAsync();
        var oauth = await SeedUserAsync("oauth@example.com", "oauthuser", password: null, oAuthProvider: "google");
        var response = await ResetAsync(token, oauth.Id);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_LocalAccount_ChangesPasswordAndRevokesSessions()
    {
        var adminToken = await AdminTokenAsync();
        var target = await SeedUserAsync("target@example.com", "targetuser", password: "OldPassword123!");

        // Establish an active session for the target (creates a refresh token).
        var targetAuth = await LoginAsync("target@example.com", "OldPassword123!");

        var response = await ResetAsync(adminToken, target.Id);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ResetPasswordResponseDto>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body!.GeneratedPassword));

        // Old password no longer works.
        var oldLogin = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "target@example.com",
            Password = "OldPassword123!"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        // New generated password works.
        var newLogin = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "target@example.com",
            Password = body.GeneratedPassword
        });
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);

        // The pre-reset refresh token is now revoked.
        var refresh = await _client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest
        {
            RefreshToken = targetAuth.RefreshToken
        });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task ResetPassword_WithoutAdminRole_ReturnsForbidden()
    {
        await SeedUserAsync("member@example.com", "memberuser");
        var auth = await LoginAsync("member@example.com", "Password123!");
        var target = await SeedUserAsync("target2@example.com", "targetuser2");

        var response = await ResetAsync(auth.AccessToken, target.Id);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private class ResetPasswordResponseDto
    {
        public Guid Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string GeneratedPassword { get; set; } = string.Empty;
    }

    private async Task SeedCharacterAsync(Guid userId, string name, DateTimeOffset? lastSyncAt)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Set<Vanalytics.Core.Models.Character>().Add(new Vanalytics.Core.Models.Character
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            Server = "Asura",
            LastSyncAt = lastSyncAt,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task<List<AdminUserListDto>> ListUsersAsync(string adminToken)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/users");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        var res = await _client.SendAsync(req);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<List<AdminUserListDto>>())!;
    }

    [Fact]
    public async Task List_ReturnsLastActiveAsMaxCharacterSync()
    {
        var adminToken = await AdminTokenAsync();
        var target = await SeedUserAsync("active@example.com", "activeuser");
        var older = DateTimeOffset.UtcNow.AddDays(-10);
        var newer = DateTimeOffset.UtcNow.AddDays(-2);
        await SeedCharacterAsync(target.Id, "Older", older);
        await SeedCharacterAsync(target.Id, "Newer", newer);

        var users = await ListUsersAsync(adminToken);
        var dto = users.Single(u => u.Id == target.Id);

        Assert.NotNull(dto.LastActiveAt);
        Assert.Equal(newer.ToUnixTimeSeconds(), dto.LastActiveAt!.Value.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task List_LastActiveIsNull_WhenUserHasNoCharacters()
    {
        var adminToken = await AdminTokenAsync();
        var target = await SeedUserAsync("nochars@example.com", "nocharsuser");

        var users = await ListUsersAsync(adminToken);
        var dto = users.Single(u => u.Id == target.Id);

        Assert.Null(dto.LastActiveAt);
    }

    private class AdminUserListDto
    {
        public Guid Id { get; set; }
        public DateTimeOffset? LastActiveAt { get; set; }
        public string? DefaultServer { get; set; }
    }
}
