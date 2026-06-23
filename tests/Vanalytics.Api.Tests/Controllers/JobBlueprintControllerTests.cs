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

    // Extended setup that also returns the addon API key.  charName and Server="Asura" must be
    // forwarded in the X-Character-Name / X-Server headers so ResolveAddonCharacterAsync can
    // match the character row to the authenticated user.
    private async Task<(string Token, Guid CharacterId, string ApiKey, string CharName, string Server)>
        SetupForAddonAsync(string email, string username, string charName)
    {
        var (token, charId) = await SetupAsync(email, username, charName);

        // The SetupAsync helper already generated an API key, but we need to generate a second one
        // so we have a value to return.  Keys accumulate per user; we generate a fresh one here
        // so the test controls which key it uses (the first key generated during SetupAsync is
        // discarded — it was only needed for the initial sync).
        // NOTE: SetupAsync logged in and stored the token; we just call generate again.
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var key = await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>();

        return (token, charId, key!.ApiKey, charName, "Asura");
    }

    // Helper: send addon-style GET /api/sync/blueprint?job=... with apikey auth headers.
    private async Task<HttpResponseMessage> PullBlueprintAsync(
        string apiKey, string charName, string server, string job)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/sync/blueprint?job={job}");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Headers.Add("X-Character-Name", charName);
        req.Headers.Add("X-Server", server);
        return await _client.SendAsync(req);
    }

    [Fact]
    public async Task Addon_pull_returns_404_when_no_blueprint_saved()
    {
        var (_, _, apiKey, charName, server) =
            await SetupForAddonAsync("addonpull1@test.com", "addonpull1", "AddonPull1");

        // No blueprint saved — endpoint should return 404.
        var resp = await PullBlueprintAsync(apiKey, charName, server, "THF");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Addon_pull_returns_lua_for_a_saved_blueprint()
    {
        var (token, charId, apiKey, charName, server) =
            await SetupForAddonAsync("addonpull2@test.com", "addonpull2", "AddonPull2");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Seed a gear set (mirrors Generate_emits_lua_from_saved_blueprint_and_gear_set).
        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "TP Set", Job = "THF", Category = "Engaged",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        // Save the blueprint (same graph that the web Generate test uses).
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
        _client.DefaultRequestHeaders.Authorization = null;

        var resp = await PullBlueprintAsync(apiKey, charName, server, "THF");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<GenerateBlueprintResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrEmpty(body!.Lua));
    }

    [Fact]
    public async Task Addon_pull_returns_empty_lua_when_blueprint_has_errors()
    {
        var (token, charId, apiKey, charName, server) =
            await SetupForAddonAsync("addonpull3@test.com", "addonpull3", "AddonPull3");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Blueprint: status_change Engaged -> equip with NO gear set (reused from
        // Generate_with_validation_error_returns_empty_lua_and_error_diagnostic).
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Position = new() { X = 0, Y = 0 }, Data = new() },
                new() { Id = "e", Type = "equip",                 Position = new() { X = 200, Y = 0 }, Data = new() },
            ],
            Edges =
            [
                new() { Id = "t-Engaged-e", Source = "t", SourceHandle = "Engaged", Target = "e", TargetHandle = "in" },
            ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        _client.DefaultRequestHeaders.Authorization = null;

        var resp = await PullBlueprintAsync(apiKey, charName, server, "THF");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<GenerateBlueprintResponse>();
        Assert.NotNull(body);
        Assert.Equal("", body!.Lua);
        Assert.Contains(body.Diagnostics, d => d.Severity == "error");
    }

    [Fact]
    public async Task Addon_pull_returns_400_when_job_param_missing()
    {
        var (_, _, apiKey, charName, server) =
            await SetupForAddonAsync("addonpull4@test.com", "addonpull4", "AddonPull4");
        _client.DefaultRequestHeaders.Authorization = null;

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/sync/blueprint"); // no ?job=
        req.Headers.Add("X-Api-Key", apiKey);
        req.Headers.Add("X-Character-Name", charName);
        req.Headers.Add("X-Server", server);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
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
        Assert.Empty(gen.Diagnostics);
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
    public async Task Generate_emits_set_combine_for_layered_member()
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
                new() { Id = "tp", Type = "mode", Data = new()
                    {
                        ModeName = "TP",
                        Members =
                        [
                            new BlueprintModeMemberDto { GearSetId = accId },
                            new BlueprintModeMemberDto { GearSetId = accId, OverlaySetIds = [thId], Label = "Treasure Hunter" },
                        ],
                    } },
            ],
            Edges = [ new() { Id = "e", Source = "t", SourceHandle = "Engaged", Target = "tp", TargetHandle = "in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        // Round-trip: layered mode member survives serialization.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        var modeNode = Assert.Single(wf!.Graph.Nodes, n => n.Type == "mode");
        Assert.Contains(modeNode.Data.Members!, m => m.OverlaySetIds is [var o] && o == thId);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("sets['Accuracy'] = {", gen!.Lua);
        Assert.Contains("sets['TH Swap'] = {", gen.Lua);
        Assert.Contains("sets.TP['Treasure Hunter'] = set_combine(sets['Accuracy'], sets['TH Swap'])", gen.Lua);
        Assert.Empty(gen.Diagnostics);
    }

    [Fact]
    public async Task Generate_emits_set_combine_for_layered_action_leaf()
    {
        var (token, charId) = await SetupAsync("wf9@test.com", "wf9", "Wfnine");
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

        var tpId = await MakeSet("TP", "Head", 13892, "Adhemar Bonnet +1");
        var saId = await MakeSet("SA Gloves", "Hands", 14000, "Plun. Armlets +1");

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:precast", Data = new() },
                new() { Id = "a", Type = "equip", Data = new() { GearSetId = tpId, ActionName = "Sneak Attack", OverlaySetIds = [saId] } },
            ],
            Edges = [ new() { Id = "e", Source = "t", SourceHandle = "JobAbility", Target = "a", TargetHandle = "in" } ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        // Round-trip: the overlay survives PUT->GET.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        var leaf = Assert.Single(wf!.Graph.Nodes, n => n.Type == "equip");
        Assert.Equal("Sneak Attack", leaf.Data.ActionName);
        Assert.Equal([saId], leaf.Data.OverlaySetIds);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("sets['TP'] = {", gen!.Lua);
        Assert.Contains("sets['SA Gloves'] = {", gen.Lua);
        Assert.Contains("if spell.english == 'Sneak Attack' then equip(set_combine(sets['TP'], sets['SA Gloves']))", gen.Lua);
        Assert.Empty(gen.Diagnostics);
    }

    [Fact]
    public async Task Blueprint_with_spell_condition_roundtrips_and_generates()
    {
        var (token, charId) = await SetupAsync("wf11@test.com", "wf11", "Wfeleven");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Seed one gear set so the equip node resolves.
        const string setName = "WS Rudra Set";
        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = setName, Job = "THF", Category = "WeaponSkill",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();
        var setId = set!.Id;

        // Build the graph: trigger:precast -[WeaponSkill]-> branch -[cond]<- spell(name, Rudra's Storm); branch -[true]-> equip
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:precast",   Position = new() { X = 0,   Y = 0 },   Data = new() },
                new() { Id = "b", Type = "branch",            Position = new() { X = 200, Y = 0 },   Data = new() },
                new() { Id = "s", Type = "spell",             Position = new() { X = 200, Y = 150 }, Data = new()
                    { SpellField = "name", SpellValue = "Rudra's Storm" } },
                new() { Id = "e", Type = "equip",             Position = new() { X = 400, Y = 0 },   Data = new()
                    { GearSetId = setId } },
            ],
            Edges =
            [
                new() { Id = "e1", Source = "t", SourceHandle = "WeaponSkill", Target = "b", TargetHandle = "in" },
                new() { Id = "e2", Source = "s", SourceHandle = "out",         Target = "b", TargetHandle = "cond" },
                new() { Id = "e3", Source = "b", SourceHandle = "true",        Target = "e", TargetHandle = "in" },
            ],
        };
        var putResp = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // Round-trip: GET and assert that the spell node's SpellField and SpellValue survive.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        Assert.NotNull(wf);
        var spellNode = Assert.Single(wf.Graph.Nodes, n => n.Type == "spell");
        Assert.Equal("name",          spellNode.Data.SpellField);
        Assert.Equal("Rudra's Storm", spellNode.Data.SpellValue);

        // Generate: assert Lua contains the spell guard and no error diagnostics.
        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();
        Assert.NotNull(gen);
        Assert.Contains("spell.english == 'Rudra\\'s Storm'", gen!.Lua);
        Assert.DoesNotContain(gen.Diagnostics, d => d.Severity == "error");
    }

    [Fact]
    public async Task Generate_with_validation_error_returns_empty_lua_and_error_diagnostic()
    {
        var (token, charId) = await SetupAsync("wf8e@test.com", "wf8e", "Wfeight");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Blueprint: status_change Engaged -> equip with NO gear set (an error)
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Position = new() { X = 0, Y = 0 }, Data = new() },
                new() { Id = "e", Type = "equip",                 Position = new() { X = 200, Y = 0 }, Data = new() },
            ],
            Edges =
            [
                new() { Id = "t-Engaged-e", Source = "t", SourceHandle = "Engaged", Target = "e", TargetHandle = "in" },
            ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.NotNull(gen);
        Assert.Equal("", gen!.Lua);
        Assert.Contains(gen.Diagnostics, d => d.Severity == "error" && d.NodeId == "e");
    }

    [Fact]
    public async Task Generate_with_warning_only_returns_lua_and_warning_diagnostic()
    {
        var (token, charId) = await SetupAsync("wf8w@test.com", "wf8w", "Wfeightw");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Blueprint: status_change Engaged -> equip(set 999 that doesn't exist) -> warning, but still generates
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Position = new() { X = 0, Y = 0 }, Data = new() },
                new() { Id = "e", Type = "equip",                 Position = new() { X = 200, Y = 0 }, Data = new() { GearSetId = 999 } },
            ],
            Edges =
            [
                new() { Id = "t-Engaged-e", Source = "t", SourceHandle = "Engaged", Target = "e", TargetHandle = "in" },
            ],
        };
        await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.NotNull(gen);
        Assert.Contains("function get_sets()", gen!.Lua);   // still generated
        Assert.Contains(gen.Diagnostics, d => d.Severity == "warning" && d.NodeId == "e");
        Assert.DoesNotContain(gen.Diagnostics, d => d.Severity == "error");
    }

    [Fact]
    public async Task Blueprint_with_branch_and_stat_condition_roundtrips_and_generates()
    {
        var (token, charId) = await SetupAsync("wf10@test.com", "wf10", "Wften");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Seed one gear set and capture its real db id + name.
        const string setName = "Low HP Set";
        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = setName, Job = "THF", Category = "Idle",
                Slots = [ new GearSetSlotDto { Slot = "Body", ItemId = 10001, ItemName = "Twilight Cloak", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();
        var setId = set!.Id;

        // Build the graph: trigger:status_change -[Idle]-> branch -[cond]<- op:compare; branch -[true]-> equip
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Position = new() { X = 0, Y = 0 }, Data = new() },
                new() { Id = "b", Type = "branch",                Position = new() { X = 200, Y = 0 }, Data = new() },
                new() { Id = "c", Type = "op:compare",            Position = new() { X = 200, Y = 150 }, Data = new()
                    { Resource = "hpp", Op = "<", Value = 25 } },
                new() { Id = "e", Type = "equip",                 Position = new() { X = 400, Y = 0 }, Data = new()
                    { GearSetId = setId } },
            ],
            Edges =
            [
                new() { Id = "e1", Source = "t", SourceHandle = "Idle",  Target = "b", TargetHandle = "in" },
                new() { Id = "e2", Source = "c", SourceHandle = "out",   Target = "b", TargetHandle = "cond" },
                new() { Id = "e3", Source = "b", SourceHandle = "true",  Target = "e", TargetHandle = "in" },
            ],
        };
        var putResp = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // Round-trip: GET and assert that the op:compare node survives with all its data fields.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        Assert.NotNull(wf);
        var condNode = Assert.Single(wf.Graph.Nodes, n => n.Type == "op:compare");
        Assert.Equal("hpp", condNode.Data.Resource);
        Assert.Equal("<",   condNode.Data.Op);
        Assert.Equal(25,    condNode.Data.Value);
        Assert.Single(wf.Graph.Nodes, n => n.Type == "branch");

        // Generate: assert the Lua contains the expected if-condition and equip call.
        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();
        Assert.NotNull(gen);
        Assert.Contains("if player.hpp < 25 then", gen.Lua);
        Assert.Contains($"equip(sets['{setName}'])", gen.Lua);
    }

    [Fact]
    public async Task Generate_emits_pet_midcast_dispatch_and_pet_change_terminal()
    {
        var (token, charId) = await SetupAsync("wfpet@test.com", "wfpet", "Wfpet");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Job/category are cosmetic for this test (codegen references sets by id); use the
        // proven-valid THF + WeaponSkill/Idle values the other passing tests in this file use.
        var bp = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "BP Set", Job = "THF", Category = "WeaponSkill",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var petIdle = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Pet Idle", Job = "THF", Category = "Idle",
                Slots = [ new GearSetSlotDto { Slot = "Body", ItemId = 14001, ItemName = "Convoker's Doublet", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "pm", Type = "trigger:pet_midcast", Data = new() },
                new() { Id = "a",  Type = "equip", Data = new() { GearSetId = bp!.Id, ActionName = "Searing Light" } },
                new() { Id = "pc", Type = "trigger:pet_change", Data = new() },
                new() { Id = "pi", Type = "equip", Data = new() { GearSetId = petIdle!.Id } },
            ],
            Edges =
            [
                new() { Id = "e1", Source = "pm", SourceHandle = "PetAction", Target = "a",  TargetHandle = "in" },
                new() { Id = "e2", Source = "pc", SourceHandle = "Summoned",  Target = "pi", TargetHandle = "in" },
            ],
        };
        var put = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        // Round-trip: both triggers survive PUT/GET.
        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        Assert.Single(wf!.Graph.Nodes, n => n.Type == "trigger:pet_midcast");
        Assert.Single(wf.Graph.Nodes, n => n.Type == "trigger:pet_change");

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.Contains("function pet_midcast(spell)", gen!.Lua);
        Assert.Contains("if spell.english == 'Searing Light' then equip(sets['BP Set'])", gen.Lua);
        Assert.DoesNotContain("if true", gen.Lua);
        Assert.Contains("function pet_change(pet, gain)", gen.Lua);
        Assert.Contains("if gain then equip(sets['Pet Idle'])", gen.Lua);
        Assert.DoesNotContain(gen.Diagnostics, d => d.Severity == "error");
    }

    [Fact]
    public async Task Blueprint_with_world_condition_roundtrips_and_generates()
    {
        var (token, charId) = await SetupAsync("wfworld@test.com", "wfworld", "Wfworld");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Fire Day Set", Job = "THF", Category = "Idle",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        // status_change Idle -> branch -[cond]<- world(day == Fire); branch -[true]-> equip
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                new() { Id = "b", Type = "branch", Data = new() },
                new() { Id = "w", Type = "world", Data = new() { WorldField = "day", WorldValue = "Fire" } },
                new() { Id = "e", Type = "equip", Data = new() { GearSetId = set!.Id } },
            ],
            Edges =
            [
                new() { Id = "e1", Source = "t", SourceHandle = "Idle",  Target = "b", TargetHandle = "in" },
                new() { Id = "e2", Source = "w", SourceHandle = "out",   Target = "b", TargetHandle = "cond" },
                new() { Id = "e3", Source = "b", SourceHandle = "true",  Target = "e", TargetHandle = "in" },
            ],
        };
        var put = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var wf = await _client.GetFromJsonAsync<BlueprintResponse>($"/api/characters/{charId}/blueprints/THF");
        var world = Assert.Single(wf!.Graph.Nodes, n => n.Type == "world");
        Assert.Equal("day", world.Data.WorldField);
        Assert.Equal("Fire", world.Data.WorldValue);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();
        Assert.Contains("if world.day_element == 'Fire' then", gen!.Lua);
        Assert.DoesNotContain(gen.Diagnostics, d => d.Severity == "error");
    }

    [Fact]
    public async Task Generate_emits_setup_at_top_and_print_then_chained_equip()
    {
        var (token, charId) = await SetupAsync("wfsetup@test.com", "wfsetup", "Wfsetup");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var set = await (await _client.PostAsJsonAsync($"/api/characters/{charId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Engaged Set", Job = "THF", Category = "Engaged",
                Slots = [ new GearSetSlotDto { Slot = "Head", ItemId = 13892, ItemName = "Adhemar Bonnet +1", Augments = [] } ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();
        var setId = set!.Id;

        // setup (file-top) + status_change -[Engaged]-> print -[out]-> equip
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "su", Type = "setup",                 Data = new() { Code = "include('organizer-lib')" } },
                new() { Id = "t",  Type = "trigger:status_change", Data = new() },
                new() { Id = "p",  Type = "print",                 Data = new() { ChatText = "Engaged!", ChatColor = 5 } },
                new() { Id = "e",  Type = "equip",                 Data = new() { GearSetId = setId } },
            ],
            Edges =
            [
                new() { Id = "e1", Source = "t", SourceHandle = "Engaged", Target = "p", TargetHandle = "in" },
                new() { Id = "e2", Source = "p", SourceHandle = "out",     Target = "e", TargetHandle = "in" },
            ],
        };
        var put = await _client.PutAsJsonAsync($"/api/characters/{charId}/blueprints/THF", graph);
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var gen = await (await _client.PostAsync($"/api/characters/{charId}/blueprints/THF/generate", null))
            .Content.ReadFromJsonAsync<GenerateBlueprintResponse>();

        Assert.DoesNotContain(gen!.Diagnostics, d => d.Severity == "error");
        Assert.Contains("function get_sets()", gen.Lua);
        // setup at file top, before get_sets
        Assert.True(gen.Lua.IndexOf("include('organizer-lib')", StringComparison.Ordinal)
                    < gen.Lua.IndexOf("function get_sets()", StringComparison.Ordinal));
        // print then chained equip in status_change
        Assert.Contains("add_to_chat(", gen.Lua);
        Assert.Contains("function status_change(new, old)", gen.Lua);
    }
}
