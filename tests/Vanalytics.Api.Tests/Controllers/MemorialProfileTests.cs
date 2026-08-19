using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class MemorialProfileTests : IAsyncLifetime
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
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
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

    /// <summary>
    /// Creates a user directly in the DB, syncs a character (auto-creating it), then makes it public.
    /// Returns the JWT token and the created character summary.
    /// </summary>
    private async Task<(string Token, CharacterSummaryResponse Character)> CreatePublicCharacterAsync(
        string email, string username, string charName, string server)
    {
        // Create user directly in DB and login
        var accessToken = await CreateUserAndGetTokenAsync(email, username);

        // Generate API key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        // Sync to auto-create character
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        // Get character
        var listReq = new HttpRequestMessage(HttpMethod.Get, "/api/characters");
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var listResp = await _client.SendAsync(listReq);
        var chars = (await listResp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        // Make it public
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);

        return (accessToken, character);
    }

    [Fact]
    public async Task MemorialProfile_ReturnsDetail_WithMemorialFields()
    {
        var resp = await _client.GetAsync("/api/profiles/Ifrit/Gravekeeper");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.True(detail!.IsMemorial);
        Assert.Equal("Gravekeeper", detail.Name);
        Assert.Equal("Ifrit", detail.Server);
        Assert.Equal("Tarutaru", detail.Race);
        Assert.Equal(13, detail.Jobs.Count);
        Assert.Equal("WAR", detail.Jobs.Single(j => j.IsActive).Job);
        Assert.Equal(15, detail.Gear.Count);
        Assert.Contains(detail.Gear, g => g.Slot == "Legs" && g.ItemId == 12818);
        Assert.Null(detail.LastSyncAt);
    }

    [Fact]
    public async Task MemorialProfile_IsCaseInsensitive()
    {
        var resp = await _client.GetAsync("/api/profiles/ifrit/gravekeeper");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task UnknownCharacter_Still404s()
    {
        var resp = await _client.GetAsync("/api/profiles/Ifrit/NoSuchChar");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task MemorialOwner_Returns404()
    {
        var resp = await _client.GetAsync("/api/profiles/Ifrit/Gravekeeper/owner");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Theory]
    [InlineData("progression")]
    [InlineData("collection")]
    [InlineData("titles")]
    [InlineData("missions")]
    [InlineData("relics")]
    [InlineData("gear-sets")]
    public async Task MemorialSubEndpoints_ReturnEmpty200(string sub)
    {
        var resp = await _client.GetAsync($"/api/profiles/Ifrit/Gravekeeper/{sub}");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task NormalCharacter_HasNullMemorialFields()
    {
        // CreatePublicCharacterAsync: copy the helper verbatim from ProfilesControllerTests
        await CreatePublicCharacterAsync("mem1@test.com", "mem1user", "MemNorm", "Asura");

        var resp = await _client.GetAsync("/api/profiles/Asura/MemNorm");
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();

        Assert.Null(detail!.IsMemorial);
        Assert.Null(detail.Dedication);
    }
}
