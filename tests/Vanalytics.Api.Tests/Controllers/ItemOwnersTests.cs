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

public class ItemOwnersTests : IAsyncLifetime
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

    private record OwnerEntry(string Name, string Server, string? Job, int? Level);
    private record OwnersEnvelope(int TotalCount, int Page, int PageSize, List<OwnerEntry> Owners);

    private static void SeedOwner(VanalyticsDbContext db, Guid userId, string name, string server, int itemId, bool isPublic = true)
    {
        var c = new Character { Id = Guid.NewGuid(), UserId = userId, Name = name, Server = server,
            IsPublic = isPublic, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Characters.Add(c);
        db.CharacterInventories.Add(new CharacterInventory { CharacterId = c.Id, ItemId = itemId,
            Quantity = 1, LastSeenAt = DateTimeOffset.UtcNow });
    }

    [Fact]
    public async Task Rare_item_owners_are_public_only_paged_filtered_sorted()
    {
        const int rareId = 27932;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = new Soverance.Auth.Models.User { Id = Guid.NewGuid(), Email = "ow@test.com", Username = "ow",
                PasswordHash = "h", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.Users.Add(u);
            db.GameItems.Add(new GameItem { ItemId = rareId, Name = "Rare Thing", Category = "Armor", Flags = 0x8000 /* Rare */ });
            SeedOwner(db, u.Id, "Alpha", "Asura", rareId);
            SeedOwner(db, u.Id, "Bravo", "Bahamut", rareId);
            SeedOwner(db, u.Id, "Hidden", "Asura", rareId, isPublic: false);
            await db.SaveChangesAsync();
        }

        var all = await _client.GetFromJsonAsync<OwnersEnvelope>($"/api/items/{rareId}/owners");
        Assert.Equal(2, all!.TotalCount);
        Assert.Equal(["Alpha", "Bravo"], all.Owners.Select(o => o.Name));

        var q = await _client.GetFromJsonAsync<OwnersEnvelope>($"/api/items/{rareId}/owners?q=brav");
        Assert.Equal("Bravo", Assert.Single(q!.Owners).Name);

        var srv = await _client.GetFromJsonAsync<OwnersEnvelope>($"/api/items/{rareId}/owners?server=Bahamut");
        Assert.Equal("Bravo", Assert.Single(srv!.Owners).Name);

        var desc = await _client.GetFromJsonAsync<OwnersEnvelope>($"/api/items/{rareId}/owners?sortBy=name&sortDir=desc");
        Assert.Equal(["Bravo", "Alpha"], desc!.Owners.Select(o => o.Name));
    }

    [Fact]
    public async Task Non_rare_ex_item_returns_empty_owner_list()
    {
        const int commonId = 4096;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = new Soverance.Auth.Models.User { Id = Guid.NewGuid(), Email = "ow2@test.com", Username = "ow2",
                PasswordHash = "h", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            db.Users.Add(u);
            db.GameItems.Add(new GameItem { ItemId = commonId, Name = "Potion", Category = "Medicines", Flags = 0 });
            SeedOwner(db, u.Id, "Holder", "Asura", commonId);
            await db.SaveChangesAsync();
        }

        var resp = await _client.GetFromJsonAsync<OwnersEnvelope>($"/api/items/{commonId}/owners");
        Assert.Equal(0, resp!.TotalCount);
        Assert.Empty(resp.Owners);
    }

    [Fact]
    public async Task Unknown_item_returns_404()
    {
        var resp = await _client.GetAsync("/api/items/999999/owners");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
