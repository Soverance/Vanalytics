using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class GearSetsControllerTests : IAsyncLifetime
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

    [Fact]
    public async Task Create_then_list_and_get_returns_set_with_slots()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs1@test.com", "gs1", "Gearsetone");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var body = new SaveGearSetRequest
        {
            Name = "TP Set",
            Job = "THF",
            Slots =
            [
                new GearSetSlotDto { Slot = "Main", ItemId = 18264, Augments = [] },
                new GearSetSlotDto { Slot = "Legs", ItemId = 27932,
                    Augments = ["Enhances \"Feint\" effect"] },
            ]
        };

        var createResp = await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets", body);
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);
        var created = await createResp.Content.ReadFromJsonAsync<GearSetDetailResponse>();
        Assert.NotNull(created);
        Assert.Equal("TP Set", created!.Name);
        Assert.Equal(2, created.Slots.Count);

        var list = await _client.GetFromJsonAsync<List<GearSetSummaryResponse>>(
            $"/api/characters/{characterId}/gear-sets");
        Assert.Single(list!);
        Assert.Equal(2, list![0].SlotCount);

        var detail = await _client.GetFromJsonAsync<GearSetDetailResponse>(
            $"/api/characters/{characterId}/gear-sets/{created.Id}");
        Assert.Equal("THF", detail!.Job);
        var legs = detail.Slots.Single(s => s.Slot == "Legs");
        Assert.Equal(27932, legs.ItemId);
        Assert.Equal("Enhances \"Feint\" effect", legs.Augments.Single());
    }

    [Fact]
    public async Task Create_persists_and_returns_slot_item_name()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs8@test.com", "gs8", "Gearseteight");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var created = await (await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest
            {
                Name = "Named",
                Slots =
                [
                    new GearSetSlotDto { Slot = "Head", ItemId = 13892,
                        ItemName = "Adhemar Bonnet +1", Augments = [] },
                ]
            }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        // The item name the picker captured must round-trip, so the GearSwap export
        // emits head="Adhemar Bonnet +1" rather than head="#13892".
        var detail = await _client.GetFromJsonAsync<GearSetDetailResponse>(
            $"/api/characters/{characterId}/gear-sets/{created!.Id}");
        var head = detail!.Slots.Single(s => s.Slot == "Head");
        Assert.Equal("Adhemar Bonnet +1", head.ItemName);
    }

    [Fact]
    public async Task Create_with_invalid_job_returns_400()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs9@test.com", "gs9", "Gearsetnine");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var resp = await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest { Name = "Bad", Job = "XYZ", Slots = [] });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Create_normalizes_job_casing_to_canonical_form()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs10@test.com", "gs10", "Gearsetten");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var created = await (await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest { Name = "Lower", Job = "thf", Slots = [] }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var detail = await _client.GetFromJsonAsync<GearSetDetailResponse>(
            $"/api/characters/{characterId}/gear-sets/{created!.Id}");
        Assert.Equal("THF", detail!.Job);
    }

    [Fact]
    public async Task Create_beyond_per_character_cap_returns_409()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs11@test.com", "gs11", "Gearseteleven");

        // Seed the character up to the cap directly (fast) so the next create is the 501st.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var now = DateTimeOffset.UtcNow;
            for (var i = 0; i < 500; i++)
                db.CharacterGearSets.Add(new CharacterGearSet
                {
                    CharacterId = characterId, Name = $"Set {i}",
                    SlotsJson = "[]", CreatedAt = now, UpdatedAt = now
                });
            await db.SaveChangesAsync();
        }

        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest { Name = "One too many", Slots = [] });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task Update_replaces_name_job_and_slots()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs2@test.com", "gs2", "Gearsettwo");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var created = await (await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest { Name = "Old", Slots = [] }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var putResp = await _client.PutAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets/{created!.Id}",
            new SaveGearSetRequest
            {
                Name = "New",
                Job = "BLU",
                Slots = [new GearSetSlotDto { Slot = "Head", ItemId = 100, Augments = [] }]
            });
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var detail = await _client.GetFromJsonAsync<GearSetDetailResponse>(
            $"/api/characters/{characterId}/gear-sets/{created.Id}");
        Assert.Equal("New", detail!.Name);
        Assert.Equal("BLU", detail.Job);
        Assert.Equal("Head", detail.Slots.Single().Slot);
    }

    [Fact]
    public async Task Delete_removes_the_set()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs3@test.com", "gs3", "Gearsetthree");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var created = await (await _client.PostAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets",
            new SaveGearSetRequest { Name = "Doomed", Slots = [] }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var del = await _client.DeleteAsync(
            $"/api/characters/{characterId}/gear-sets/{created!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await _client.GetFromJsonAsync<List<GearSetSummaryResponse>>(
            $"/api/characters/{characterId}/gear-sets");
        Assert.Empty(list!);
    }

    [Fact]
    public async Task Other_users_character_is_forbidden()
    {
        var (_, _, victimCharId) = await SetupUserWithCharacterAsync(
            "owner@test.com", "owner", "Ownerchar");
        var (attackerToken, _, _) = await SetupUserWithCharacterAsync(
            "attacker@test.com", "attacker", "Attackerchar");

        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", attackerToken);

        var resp = await _client.GetAsync($"/api/characters/{victimCharId}/gear-sets");
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Update_or_delete_nonexistent_set_returns_404()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs6@test.com", "gs6", "Gearsetsix");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var put = await _client.PutAsJsonAsync(
            $"/api/characters/{characterId}/gear-sets/999999",
            new SaveGearSetRequest { Name = "Nope", Slots = [] });
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);

        var del = await _client.DeleteAsync(
            $"/api/characters/{characterId}/gear-sets/999999");
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
    }

    [Fact]
    public async Task OwnedEquipment_returns_inventory_and_equipped_rolls()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs5@test.com", "gs5", "Gearsetfive");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = 27932, Name = "Plun. Culottes +1",
                Category = "Armor", Slots = 0x0080 /* Legs */, Jobs = 1 << 6 /* THF */ });
            db.GameItems.Add(new GameItem { ItemId = 18264, Name = "Mandau",
                Category = "Weapons", Slots = 0x0001 /* Main */ });
            db.CharacterInventories.Add(new CharacterInventory
            {
                CharacterId = characterId, ItemId = 27932, Quantity = 1,
                LastSeenAt = DateTimeOffset.UtcNow,
                AugmentsJson = "[\"Enhances \\\"Feint\\\" effect\"]"
            });
            db.EquippedGear.Add(new EquippedGear
            {
                Id = Guid.NewGuid(), CharacterId = characterId,
                Slot = Vanalytics.Core.Enums.EquipSlot.Main, ItemId = 18264,
                ItemName = "Mandau"
            });
            await db.SaveChangesAsync();
        }

        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var items = await _client.GetFromJsonAsync<List<OwnedEquipmentItem>>(
            $"/api/characters/{characterId}/gear-sets/owned-equipment");

        Assert.Contains(items!, i => i.ItemId == 27932 && i.Slots == 0x0080
            && i.Jobs == (1 << 6) /* THF, for job-equippable filtering */
            && i.Augments.Contains("Enhances \"Feint\" effect"));
        Assert.Contains(items!, i => i.ItemId == 18264 && i.Slots == 0x0001 && i.Augments.Count == 0);
    }

    [Fact]
    public async Task OwnedEquipment_dedupes_same_item_roll_across_sources()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync(
            "gs7@test.com", "gs7", "Gearsetseven");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = 19528, Name = "Mandau",
                Category = "Weapons", Slots = 0x0001 /* Main */ });
            // Same item, same (null) augments, present in BOTH inventory and equipped.
            db.CharacterInventories.Add(new CharacterInventory
            {
                CharacterId = characterId, ItemId = 19528, Quantity = 1,
                LastSeenAt = DateTimeOffset.UtcNow
            });
            db.EquippedGear.Add(new EquippedGear
            {
                Id = Guid.NewGuid(), CharacterId = characterId,
                Slot = Vanalytics.Core.Enums.EquipSlot.Main, ItemId = 19528,
                ItemName = "Mandau"
            });
            await db.SaveChangesAsync();
        }

        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var items = await _client.GetFromJsonAsync<List<OwnedEquipmentItem>>(
            $"/api/characters/{characterId}/gear-sets/owned-equipment");

        // The same item+roll from two sources must collapse to a single entry.
        Assert.Single(items!, i => i.ItemId == 19528);
    }

    [Fact]
    public async Task Cross_user_cannot_mutate_anothers_gear_sets()
    {
        var (ownerToken, _, ownerCharId) = await SetupUserWithCharacterAsync(
            "gsown@test.com", "gsown", "Gsowner");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);
        var created = await (await _client.PostAsJsonAsync(
            $"/api/characters/{ownerCharId}/gear-sets",
            new SaveGearSetRequest { Name = "Mine", Slots = [] }))
            .Content.ReadFromJsonAsync<GearSetDetailResponse>();

        var (attackerToken, _, _) = await SetupUserWithCharacterAsync(
            "gsatk@test.com", "gsatk", "Gsattacker");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", attackerToken);

        var put = await _client.PutAsJsonAsync(
            $"/api/characters/{ownerCharId}/gear-sets/{created!.Id}",
            new SaveGearSetRequest { Name = "Hacked", Slots = [] });
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);

        var del = await _client.DeleteAsync(
            $"/api/characters/{ownerCharId}/gear-sets/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, del.StatusCode);
    }
}
