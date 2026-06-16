// tests/Vanalytics.Api.Tests/Controllers/JobBlueprintControllerTests.cs
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
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class JobBlueprintControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                if (desc != null) services.Remove(desc);
                services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
            });
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                ["Jwt:Issuer"] = "VanalyticsTest", ["Jwt:Audience"] = "VanalyticsTest",
                ["Jwt:AccessTokenExpirationMinutes"] = "15", ["Jwt:RefreshTokenExpirationDays"] = "7"
            }));
        });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<(string Token, Guid CharacterId)> SetupAsync(string email, string username, string charName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Users.Add(new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(), Email = email, Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var login = await (await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { Email = email, Password = "Password123!" }))
            .Content.ReadFromJsonAsync<AuthResponse>();

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", login!.AccessToken);
        var key = await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>();

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", key!.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName, Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99,
            Jobs = [new SyncJobEntry { Job = "THF", Level = 99 }]
        });
        await _client.SendAsync(syncReq);

        var character = await db.Characters.FirstAsync(c => c.Name == charName);
        return (login.AccessToken, character.Id);
    }

    [Fact]
    public async Task Get_before_save_returns_empty_graph()
    {
        var (token, charId) = await SetupAsync("wf1@test.com", "wf1", "Wfone");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        Assert.Equal("THF", wf!.Job);
        Assert.Empty(wf.Graph.Nodes);
        Assert.Null(wf.UpdatedAt);
    }

    [Fact]
    public async Task Put_then_get_roundtrips_graph_and_upserts()
    {
        var (token, charId) = await SetupAsync("wf2@test.com", "wf2", "Wftwo");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id="t", Type="trigger:status_change", Position=new(){X=1,Y=2}, Data=new() } ],
            Edges = [],
        };
        var put1 = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, put1.StatusCode);

        // Second PUT must UPDATE, not create a duplicate (unique CharacterId+Job).
        graph.Nodes.Add(new() { Id="e", Type="equip", Data=new() { GearSetId = 7 } });
        var put2 = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, put2.StatusCode);

        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        Assert.Equal(2, wf!.Graph.Nodes.Count);
        Assert.NotNull(wf.UpdatedAt);
    }

    [Fact]
    public async Task Put_with_invalid_job_returns_400()
    {
        var (token, charId) = await SetupAsync("wf3@test.com", "wf3", "Wfthree");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/XYZ", new BlueprintGraphDto());
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Generate_emits_lua_from_saved_blueprint_and_gear_set()
    {
        var (token, charId) = await SetupAsync("wf4@test.com", "wf4", "Wffour");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "TP Set", Job = "THF", Category = "Engaged",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id="t", Type="trigger:status_change", Data=new() },
                new() { Id="e", Type="equip", Data=new() { GearSetId = set!.Id } },
            ],
            Edges = [ new() { Id="x", Source="t", SourceHandle="Engaged", Target="e", TargetHandle="in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("sets['TP Set'] = {", gen!.Lua);
        Assert.Contains("head=\"Adhemar Bonnet +1\",", gen.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets['TP Set'])", gen.Lua);
        Assert.Empty(gen.Warnings);
    }

    [Fact]
    public async Task Other_users_character_is_forbidden()
    {
        var (_, victim) = await SetupAsync("wfvic@test.com", "wfvic", "Wfvictim");
        var (attacker, _) = await SetupAsync("wfatk@test.com", "wfatk", "Wfattacker");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", attacker);

        var resp = await _client.GetAsync($"/api/characters/{victim}/blueprints/THF");
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Generate_emits_named_action_dispatch()
    {
        var (token, charId) = await SetupAsync("wf5@test.com", "wf5", "Wffive");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Mercy WS", Job = "THF", Category = "WeaponSkill",
                Slots = [ new GearSetSlotDto { Slot = "Ammo", ItemId = 1, ItemName = "Jukukik Feather", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:precast", Data = new() },
                new() { Id = "a", Type = "equip", Data = new() { GearSetId = set!.Id, ActionName = "Mercy Stroke" } },
            ],
            Edges = [ new() { Id = "e", Source = "t", SourceHandle = "WeaponSkill", Target = "a", TargetHandle = "in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("if spell.type == 'WeaponSkill' then", gen!.Lua);
        Assert.Contains("if spell.english == 'Mercy Stroke' then equip(sets['Mercy WS'])", gen.Lua);
    }

    [Fact]
    public async Task Generate_emits_mode_self_command_and_namespaced_sets()
    {
        var (token, charId) = await SetupAsync("wf6@test.com", "wf6", "Wfsix");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Acc Set", Job = "THF", Category = "Engaged",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                new() { Id = "tp", Type = "mode", Data = new()
                    { ModeName = "TP", Members = [ new BlueprintModeMemberDto { GearSetId = set!.Id } ] } },
            ],
            Edges = [ new() { Id = "e", Source = "t", SourceHandle = "Engaged", Target = "tp", TargetHandle = "in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        // Round-trip: the mode node + its members survive PUT/GET serialization.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        var modeNode = Assert.Single(wf!.Graph.Nodes, n => n.Type == "mode");
        Assert.Equal("TP", modeNode.Data.ModeName);
        Assert.Single(modeNode.Data.Members!);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("sets.TP['Acc Set'] = {", gen!.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets.TP[TP_Set_Names[TP_Index]])", gen.Lua);
        Assert.Contains("if command == 'cycle TP set' then", gen.Lua);
    }

    [Fact]
    public async Task Generate_emits_set_combine_for_combine_node_and_layered_member()
    {
        var (token, charId) = await SetupAsync("wf7@test.com", "wf7", "Wfseven");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        async Task<long> MakeSet(string name, string slot, int itemId, string itemName)
        {
            var s = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
                new SaveGearSetRequest
                {
                    Name = name, Job = "THF", Category = "Engaged",
                    Slots = [ new GearSetSlotDto { Slot = slot, ItemId = itemId, ItemName = itemName, Augments = [] } ]
                }))
                .Content.ReadFromJsonAsync<GearSetDetailResponse>();
            return s!.Id;
        }

        var accId = await MakeSet("Accuracy", "Head", 13892, "Adhemar Bonnet +1");
        var thId = await MakeSet("TH Swap", "Hands", 14000, "Plun. Armlets +1");

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                new() { Id = "c", Type = "combine", Data = new() { CombineSetIds = [accId, thId] } },
                new() { Id = "tp", Type = "mode", Data = new()
                    {
                        ModeName = "TP",
                        Members =
                        [
                            new BlueprintModeMemberDto { GearSetId = accId },
                            new BlueprintModeMemberDto { CombineNodeId = "c", Label = "Treasure Hunter" },
                        ],
                    } },
            ],
            Edges = [ new() { Id = "e", Source = "t", SourceHandle = "Engaged", Target = "tp", TargetHandle = "in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        // Round-trip: combine node + combine-backed member survive serialization.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        var combineNode = Assert.Single(wf!.Graph.Nodes, n => n.Type == "combine");
        Assert.Equal(2, combineNode.Data.CombineSetIds!.Count);
        var modeNode = Assert.Single(wf.Graph.Nodes, n => n.Type == "mode");
        Assert.Contains(modeNode.Data.Members!, m => m.CombineNodeId == "c");

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("sets['Accuracy'] = {", gen!.Lua);
        Assert.Contains("sets['TH Swap'] = {", gen.Lua);
        Assert.Contains("sets.TP['Treasure Hunter'] = set_combine(sets['Accuracy'], sets['TH Swap'])", gen.Lua);
        Assert.Empty(gen.Warnings);
    }
}
