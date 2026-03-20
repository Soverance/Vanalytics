using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Characters;
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

    [Fact]
    public async Task CreateCharacter_ReturnsCreated()
    {
        var token = await RegisterAndGetTokenAsync("char1@test.com", "char1user");
        var req = Authed(HttpMethod.Post, "/api/characters", token);
        req.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Soverance", Server = "Asura" });

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var character = await resp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();
        Assert.Equal("Soverance", character!.Name);
        Assert.Equal("Asura", character.Server);
        Assert.Equal("Unlicensed", character.LicenseStatus);
    }

    [Fact]
    public async Task CreateCharacter_DuplicateNameServer_ReturnsConflict()
    {
        var token = await RegisterAndGetTokenAsync("char2@test.com", "char2user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Dupechar", Server = "Asura" });
        await _client.SendAsync(req1);

        var req2 = Authed(HttpMethod.Post, "/api/characters", token);
        req2.Content = JsonContent.Create(new CreateCharacterRequest { Name = "Dupechar", Server = "Asura" });
        var resp = await _client.SendAsync(req2);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task ListCharacters_ReturnsOwnCharacters()
    {
        var token = await RegisterAndGetTokenAsync("char3@test.com", "char3user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "ListChar", Server = "Asura" });
        await _client.SendAsync(req1);

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, "/api/characters", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var chars = await resp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>();
        Assert.Single(chars!);
        Assert.Equal("ListChar", chars[0].Name);
    }

    [Fact]
    public async Task GetCharacter_OwnerCanAccess()
    {
        var token = await RegisterAndGetTokenAsync("char4@test.com", "char4user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "DetailChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created!.Id}", token));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var detail = await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>();
        Assert.Equal("DetailChar", detail!.Name);
    }

    [Fact]
    public async Task GetCharacter_NonOwnerGetsForbidden()
    {
        var token1 = await RegisterAndGetTokenAsync("char5a@test.com", "char5auser");
        var token2 = await RegisterAndGetTokenAsync("char5b@test.com", "char5buser");

        var req1 = Authed(HttpMethod.Post, "/api/characters", token1);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "OtherChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created!.Id}", token2));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task UpdateCharacter_TogglesPublic()
    {
        var token = await RegisterAndGetTokenAsync("char6@test.com", "char6user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "ToggleChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var req2 = Authed(HttpMethod.Put, $"/api/characters/{created!.Id}", token);
        req2.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        var resp = await _client.SendAsync(req2);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var updated = await resp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();
        Assert.True(updated!.IsPublic);
    }

    [Fact]
    public async Task DeleteCharacter_Removes()
    {
        var token = await RegisterAndGetTokenAsync("char7@test.com", "char7user");
        var req1 = Authed(HttpMethod.Post, "/api/characters", token);
        req1.Content = JsonContent.Create(new CreateCharacterRequest { Name = "DeleteChar", Server = "Asura" });
        var createResp = await _client.SendAsync(req1);
        var created = await createResp.Content.ReadFromJsonAsync<CharacterSummaryResponse>();

        var resp = await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/characters/{created!.Id}", token));
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var getResp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{created.Id}", token));
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);
    }

    [Fact]
    public async Task WithoutAuth_ReturnsUnauthorized()
    {
        var resp = await _client.GetAsync("/api/characters");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
