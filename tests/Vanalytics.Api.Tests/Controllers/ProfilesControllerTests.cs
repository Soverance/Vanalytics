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

public class ProfilesControllerTests : IAsyncLifetime
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

    /// <summary>
    /// Registers a user, syncs a character (auto-creating it), then optionally makes it public.
    /// Returns the JWT token and the created character summary.
    /// </summary>
    private async Task<(string Token, CharacterSummaryResponse Character)> CreatePublicCharacterAsync(
        string email, string username, string charName, string server)
    {
        // Register user
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        // Generate API key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
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
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var listResp = await _client.SendAsync(listReq);
        var chars = (await listResp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        // Make it public
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);

        return (auth.AccessToken, character);
    }

    [Fact]
    public async Task GetPublicProfile_WhenPublic_ReturnsProfile()
    {
        await CreatePublicCharacterAsync("prof1@test.com", "prof1user", "PubChar", "Asura");

        var resp = await _client.GetAsync("/api/profiles/Asura/PubChar");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.Equal("PubChar", detail!.Name);
        Assert.Equal("Asura", detail.Server);
    }

    [Fact]
    public async Task GetPublicProfile_WhenPrivate_ReturnsNotFound()
    {
        // Register user
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = "prof2@test.com", Username = "prof2user", Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        // Generate API key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        // Sync to auto-create character (not made public)
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = "PrivChar",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        });
        await _client.SendAsync(syncReq);

        var resp = await _client.GetAsync("/api/profiles/Asura/PrivChar");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetPublicProfile_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
