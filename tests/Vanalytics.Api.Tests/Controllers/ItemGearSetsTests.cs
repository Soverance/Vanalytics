using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ItemGearSetsTests : IAsyncLifetime
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

    private record GearSetEntry(string Server, string CharacterName, long SetId, string SetName, string Category, string? Job);
    private record GearSetsEnvelope(int TotalCount, int Page, int PageSize, List<GearSetEntry> Entries);

    [Fact]
    public async Task Returns_only_public_characters_sets_and_dedupes_per_set()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = new Soverance.Auth.Models.User { Id = Guid.NewGuid(), Email = "ig@test.com", Username = "ig",
                PasswordHash = "h", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.Users.Add(u);
            db.GameItems.Add(new GameItem { ItemId = 27932, Name = "Plun. Culottes +1", Category = "Armor" });

            var pub = new Character { Id = Guid.NewGuid(), UserId = u.Id, Name = "Publicchar", Server = "Asura",
                IsPublic = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var priv = new Character { Id = Guid.NewGuid(), UserId = u.Id, Name = "Privatechar", Server = "Bahamut",
                IsPublic = false, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.Characters.AddRange(pub, priv);

            var now = DateTimeOffset.UtcNow;
            var pubSet = new CharacterGearSet { CharacterId = pub.Id, Name = "TP", Job = "THF", Category = "Engaged",
                CreatedAt = now, UpdatedAt = now,
                Slots = { new GearSetSlot { Slot = "Legs", ItemId = 27932, ItemName = "Plun. Culottes +1" },
                          new GearSetSlot { Slot = "Feet", ItemId = 27932, ItemName = "Plun. Culottes +1" } } };
            var privSet = new CharacterGearSet { CharacterId = priv.Id, Name = "Hidden", Category = "Other",
                CreatedAt = now, UpdatedAt = now,
                Slots = { new GearSetSlot { Slot = "Legs", ItemId = 27932, ItemName = "Plun. Culottes +1" } } };
            db.CharacterGearSets.AddRange(pubSet, privSet);
            await db.SaveChangesAsync();
        }

        var resp = await _client.GetFromJsonAsync<GearSetsEnvelope>("/api/items/27932/gear-sets");
        Assert.NotNull(resp);
        Assert.Equal(1, resp!.TotalCount);
        var entry = Assert.Single(resp.Entries);
        Assert.Equal("Publicchar", entry.CharacterName);
        Assert.Equal("Asura", entry.Server);
        Assert.Equal("TP", entry.SetName);
        Assert.Equal("Engaged", entry.Category);
        Assert.Equal("THF", entry.Job);
    }

    [Fact]
    public async Task Unknown_item_returns_404()
    {
        var resp = await _client.GetAsync("/api/items/999999/gear-sets");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
