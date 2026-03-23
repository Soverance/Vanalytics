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

public class CharactersControllerTests : IAsyncLifetime
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

    private async Task<string> RegisterAndGetTokenAsync(string email, string username)
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private HttpRequestMessage Authed(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    private async Task<(string Token, Guid CharacterId)> SetupUserWithCharacterAsync(
        string email, string username, string charName)
    {
        var token = await RegisterAndGetTokenAsync(email, username);

        // Generate API key
        var keyReq = Authed(HttpMethod.Post, "/api/keys/generate", token);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        // Sync to auto-create character
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        // Get character ID
        var listResp = await _client.SendAsync(Authed(HttpMethod.Get, "/api/characters", token));
        var chars = (await listResp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        return (token, character.Id);
    }

    [Fact]
    public async Task ListCharacters_ReturnsOwnCharacters()
    {
        var (token, _) = await SetupUserWithCharacterAsync("char3@test.com", "char3user", "ListChar");

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, "/api/characters", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var chars = await resp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>();
        Assert.Single(chars!);
        Assert.Equal("ListChar", chars[0].Name);
    }

    [Fact]
    public async Task GetCharacter_OwnerCanAccess()
    {
        var (token, charId) = await SetupUserWithCharacterAsync("char4@test.com", "char4user", "DetailChar");

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.Equal("DetailChar", detail!.Name);
    }

    [Fact]
    public async Task GetCharacter_NonOwnerGetsForbidden()
    {
        var (_, charId) = await SetupUserWithCharacterAsync("char5a@test.com", "char5auser", "OtherChar");
        var token2 = await RegisterAndGetTokenAsync("char5b@test.com", "char5buser");

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}", token2));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateCharacter_TogglesPublic()
    {
        var (token, charId) = await SetupUserWithCharacterAsync("char6@test.com", "char6user", "ToggleChar");

        var req2 = Authed(HttpMethod.Put, $"/api/characters/{charId}", token);
        req2.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        var resp = await _client.SendAsync(req2);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var updated = await resp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();
        Assert.True(updated!.IsPublic);
    }

    [Fact]
    public async Task DeleteCharacter_Removes()
    {
        var (token, charId) = await SetupUserWithCharacterAsync("char7@test.com", "char7user", "DeleteChar");

        var resp = await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/characters/{charId}", token));
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var getResp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}", token));
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);
    }

    [Fact]
    public async Task WithoutAuth_ReturnsUnauthorized()
    {
        var resp = await _client.GetAsync("/api/characters");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
