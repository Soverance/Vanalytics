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

public class ProfileOwnerTests : IAsyncLifetime
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

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = password });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private async Task<string> CreatePublicCharacterAsync(string email, string username, string charName, string server)
    {
        var accessToken = await CreateUserAndGetTokenAsync(email, username);

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName, Server = server, ActiveJob = "WAR", ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        var listReq = new HttpRequestMessage(HttpMethod.Get, "/api/characters");
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var chars = (await (await _client.SendAsync(listReq)).Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);

        return accessToken;
    }

    private async Task CreatePrivateCharacterAsync(string email, string username, string charName, string server)
    {
        var token = await CreateUserAndGetTokenAsync(email, username);
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest { CharacterName = charName, Server = server, ActiveJob = "WAR", ActiveJobLevel = 75 });
        await _client.SendAsync(syncReq);
    }

    private async Task<CharacterOwnerResponse> GetOwnerAsync(string server, string name, string? token = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/profiles/{server}/{name}/owner");
        if (token != null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<CharacterOwnerResponse>())!;
    }

    private async Task BlockAsync(string blockerToken, Guid blockedUserId)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/users/{blockedUserId}/block");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", blockerToken);
        var resp = await _client.SendAsync(req);
        resp.EnsureSuccessStatusCode();
    }

    // Sync + publish a second character under an already-authenticated token,
    // so its owner id can be read back via the anonymous owner endpoint.
    private async Task CreatePublicCharacterViaTokenAsync(string accessToken, string charName, string server)
    {
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName, Server = server, ActiveJob = "WAR", ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        var listReq = new HttpRequestMessage(HttpMethod.Get, "/api/characters");
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var chars = (await (await _client.SendAsync(listReq)).Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);
    }

    [Fact]
    public async Task Owner_Anonymous_ReturnsIdentityAndCannotMessage()
    {
        await CreatePublicCharacterAsync("own_anon@test.com", "ownanonuser", "AnonChar", "Asura");
        var owner = await GetOwnerAsync("Asura", "AnonChar");
        Assert.Equal("ownanonuser", owner.OwnerUsername);
        Assert.NotEqual(Guid.Empty, owner.OwnerUserId);
        Assert.False(owner.CanMessage);
    }

    [Fact]
    public async Task Owner_SignedInOtherUser_CanMessage()
    {
        await CreatePublicCharacterAsync("own_a@test.com", "ownauser", "OwnerCharA", "Asura");
        var viewerToken = await CreateUserAndGetTokenAsync("own_b@test.com", "ownbuser");
        var owner = await GetOwnerAsync("Asura", "OwnerCharA", viewerToken);
        Assert.True(owner.CanMessage);
    }

    [Fact]
    public async Task Owner_ViewingOwnCharacter_CannotMessage()
    {
        var ownerToken = await CreatePublicCharacterAsync("own_self@test.com", "ownselfuser", "SelfChar", "Asura");
        var owner = await GetOwnerAsync("Asura", "SelfChar", ownerToken);
        Assert.False(owner.CanMessage);
    }

    [Fact]
    public async Task Owner_WhenOwnerBlockedViewer_CannotMessage()
    {
        var ownerToken = await CreatePublicCharacterAsync("own_blk1@test.com", "ownblk1", "BlkChar1", "Asura");
        var viewerToken = await CreateUserAndGetTokenAsync("own_blk1v@test.com", "ownblk1v");
        await CreatePublicCharacterViaTokenAsync(viewerToken, "ViewerChar1", "Asura");
        var viewerId = (await GetOwnerAsync("Asura", "ViewerChar1")).OwnerUserId;
        await BlockAsync(ownerToken, viewerId); // owner blocks viewer
        var owner = await GetOwnerAsync("Asura", "BlkChar1", viewerToken);
        Assert.False(owner.CanMessage);
    }

    [Fact]
    public async Task Owner_WhenViewerBlockedOwner_CannotMessage()
    {
        var ownerToken = await CreatePublicCharacterAsync("own_blk2@test.com", "ownblk2", "BlkChar2", "Asura");
        var ownerId = (await GetOwnerAsync("Asura", "BlkChar2")).OwnerUserId;
        var viewerToken = await CreateUserAndGetTokenAsync("own_blk2v@test.com", "ownblk2v");
        await BlockAsync(viewerToken, ownerId); // viewer blocks owner
        var owner = await GetOwnerAsync("Asura", "BlkChar2", viewerToken);
        Assert.False(owner.CanMessage);
    }

    [Fact]
    public async Task Owner_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("own_priv@test.com", "ownprivuser", "PrivOwnerChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/PrivOwnerChar/owner");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Owner_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/owner");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task SendMessage_WhenRecipientBlockedSender_ReturnsForbidden()
    {
        // Recipient owns a public character; we read their user id from the owner endpoint.
        var recipientToken = await CreatePublicCharacterAsync("blk_recv@test.com", "blkrecv", "RecvChar", "Asura");
        var recipientId = (await GetOwnerAsync("Asura", "RecvChar")).OwnerUserId;

        var senderToken = await CreateUserAndGetTokenAsync("blk_send@test.com", "blksend");

        // Recipient blocks sender.
        await BlockAsync(recipientToken, await GetSenderIdAsync(senderToken));

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/messages");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", senderToken);
        req.Content = JsonContent.Create(new { toUserId = recipientId, body = "hello" });
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    // Reads a user's own id by publishing a throwaway public character and reading it back.
    private async Task<Guid> GetSenderIdAsync(string token)
    {
        await CreatePublicCharacterViaTokenAsync(token, "SenderProbeChar", "Asura");
        return (await GetOwnerAsync("Asura", "SenderProbeChar")).OwnerUserId;
    }
}
