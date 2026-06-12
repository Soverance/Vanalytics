using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AuthControllerTests : IAsyncLifetime
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

    private async Task<string> CreateUserAndGetTokenAsync(string email, string username, string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private async Task<AuthResponse> CreateUserAndGetAuthAsync(string email, string username, string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsTokens()
    {
        await CreateUserAndGetTokenAsync("login@example.com", "loginuser");

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "login@example.com",
            Password = "Password123!"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.NotEmpty(auth.AccessToken);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        await CreateUserAndGetTokenAsync("wrong@example.com", "wronguser");

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = "wrong@example.com",
            Password = "WrongPassword!"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_WithValidToken_ReturnsProfile()
    {
        var token = await CreateUserAndGetTokenAsync("me@example.com", "meuser");

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<UserProfileResponse>();
        Assert.Equal("me@example.com", profile!.Email);
        Assert.Equal("meuser", profile.Username);
    }

    [Fact]
    public async Task Me_WithoutToken_ReturnsUnauthorized()
    {
        var response = await _client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_WithValidToken_ReturnsNewTokens()
    {
        var auth = await CreateUserAndGetAuthAsync("refresh@example.com", "refreshuser");

        var response = await _client.PostAsJsonAsync("/api/auth/refresh", new RefreshRequest
        {
            RefreshToken = auth.RefreshToken
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var newAuth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(newAuth);
        Assert.NotEmpty(newAuth.AccessToken);
        Assert.NotEqual(auth.RefreshToken, newAuth.RefreshToken);
    }

    [Fact]
    public async Task UpdateDisplayName_WithValidName_PersistsAndReturnsIt()
    {
        var token = await CreateUserAndGetTokenAsync("dn1@example.com", "dn1user");
        var response = await SendDisplayNameAsync(token, "Aldo the Brave");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await GetMeAsync(token);
        Assert.Equal("Aldo the Brave", me.DisplayName);
    }

    [Fact]
    public async Task UpdateDisplayName_WithBlank_ClearsToNull()
    {
        var token = await CreateUserAndGetTokenAsync("dn2@example.com", "dn2user");
        await SendDisplayNameAsync(token, "Temporary");

        var response = await SendDisplayNameAsync(token, "   ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await GetMeAsync(token);
        Assert.Null(me.DisplayName);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("bad@name")]
    public async Task UpdateDisplayName_WithInvalidName_ReturnsBadRequest(string name)
    {
        var token = await CreateUserAndGetTokenAsync($"dn-{Math.Abs(name.GetHashCode())}@example.com", $"dn{Math.Abs(name.GetHashCode())}");

        var response = await SendDisplayNameAsync(token, name);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UpdateDisplayName_WithoutAuth_ReturnsUnauthorized()
    {
        var response = await _client.PutAsync("/api/auth/me/display-name",
            JsonContent.Create(new { displayName = "Whoever" }));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private async Task<HttpResponseMessage> SendDisplayNameAsync(string token, string? displayName)
    {
        var req = new HttpRequestMessage(HttpMethod.Put, "/api/auth/me/display-name")
        {
            Content = JsonContent.Create(new { displayName })
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await _client.SendAsync(req);
    }

    private async Task<UserProfileResponse> GetMeAsync(string token)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        return (await resp.Content.ReadFromJsonAsync<UserProfileResponse>())!;
    }
}
