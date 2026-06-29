using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class GearSwapImportControllerTests : IAsyncLifetime
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

    private async Task<(string Token, string ApiKey, Guid CharacterId)> SetupUserWithCharacterAsync(
        string email, string username, string charName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        { Email = email, Password = "Password123!" });
        var auth = (await loginResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

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

        var character = await db.Characters.FirstAsync(c => c.Name == charName);
        return (auth.AccessToken, apiKey.ApiKey, character.Id);
    }

    private async Task SeedItemsAsync(params (int id, string name, int slots)[] items)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        foreach (var (id, name, slots) in items)
            db.GameItems.Add(new GameItem { ItemId = id, Name = name, Slots = slots, Category = "Armor" });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Preview_then_commit_creates_sets()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync("imp1@test.com", "imp1", "Importone");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await SeedItemsAsync((11000, "Adhemar Bonnet +1", 0x1), (18264, "Twashtar", 0x1));

        const string lua = "sets.engaged = { head=\"Adhemar Bonnet +1\", main=\"Made Up Sword\" }";
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(lua));
        form.Add(fileContent, "file", "Importone_THF.lua");

        var previewResp = await _client.PostAsync($"/api/characters/{characterId}/gear-sets/import/preview", form);
        Assert.Equal(HttpStatusCode.OK, previewResp.StatusCode);
        var preview = await previewResp.Content.ReadFromJsonAsync<GearSwapImportPreview>();
        Assert.NotNull(preview);
        Assert.Equal("THF", preview!.SuggestedJob);
        var set = Assert.Single(preview.Sets);
        Assert.Equal("Engaged", set.Name);
        Assert.Contains(set.Slots, s => s.Slot == "Head" && s.MatchKind == "exact" && s.ItemId == 11000);
        Assert.Contains(set.Slots, s => s.Slot == "Main" && s.MatchKind == "unresolved" && s.ItemId == 0);

        var commit = new ImportCommitRequest
        {
            Job = "THF",
            Sets =
            [
                new SaveGearSetRequest
                {
                    Name = "Engaged", Job = "THF", Category = "Engaged",
                    Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 11000, ItemName = "Adhemar Bonnet +1" } ],
                }
            ],
        };
        var commitResp = await _client.PostAsJsonAsync($"/api/characters/{characterId}/gear-sets/import/commit", commit);
        Assert.Equal(HttpStatusCode.OK, commitResp.StatusCode);
        var result = await commitResp.Content.ReadFromJsonAsync<ImportCommitResponse>();
        Assert.Equal(1, result!.Created);

        var listResp = await _client.GetFromJsonAsync<List<GearSetSummaryResponse>>($"/api/characters/{characterId}/gear-sets");
        Assert.Contains(listResp!, s => s.Name == "Engaged" && s.Job == "THF");
    }

    [Fact]
    public async Task Commit_is_job_scoped_and_tolerates_duplicate_names_across_jobs()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync("imp2@test.com", "imp2", "Importtwo");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await SeedItemsAsync((11000, "Adhemar Bonnet +1", 0x1));

        // Pre-existing WAR "Idle" set, created directly.
        var warIdle = new SaveGearSetRequest
        {
            Name = "Idle", Job = "WAR", Category = "Idle",
            Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 11000, ItemName = "Adhemar Bonnet +1" } ],
        };
        var warResp = await _client.PostAsJsonAsync($"/api/characters/{characterId}/gear-sets", warIdle);
        Assert.Equal(HttpStatusCode.Created, warResp.StatusCode);

        // Import a THF file that also defines an "Idle" set.
        const string lua = "sets.idle = { head=\"Adhemar Bonnet +1\" }";
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(lua)), "file", "Importtwo_THF.lua");
        var previewResp = await _client.PostAsync($"/api/characters/{characterId}/gear-sets/import/preview", form);
        Assert.Equal(HttpStatusCode.OK, previewResp.StatusCode);
        var preview = await previewResp.Content.ReadFromJsonAsync<GearSwapImportPreview>();
        // THF "Idle" must NOT be flagged as overwriting the WAR "Idle".
        Assert.False(Assert.Single(preview!.Sets).OverwritesExisting);

        var commit = new ImportCommitRequest
        {
            Job = "THF",
            Sets = [ new SaveGearSetRequest { Name = "Idle", Job = "THF", Category = "Idle",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 11000, ItemName = "Adhemar Bonnet +1" } ] } ],
        };
        var commitResp = await _client.PostAsJsonAsync($"/api/characters/{characterId}/gear-sets/import/commit", commit);
        Assert.Equal(HttpStatusCode.OK, commitResp.StatusCode);
        var result = await commitResp.Content.ReadFromJsonAsync<ImportCommitResponse>();
        Assert.Equal(1, result!.Created);   // NEW THF Idle created, WAR Idle NOT overwritten
        Assert.Equal(0, result.Updated);

        var list = await _client.GetFromJsonAsync<List<GearSetSummaryResponse>>($"/api/characters/{characterId}/gear-sets");
        Assert.Equal(2, list!.Count(s => s.Name == "Idle"));
        Assert.Contains(list, s => s.Name == "Idle" && s.Job == "WAR");
        Assert.Contains(list, s => s.Name == "Idle" && s.Job == "THF");
    }
}
