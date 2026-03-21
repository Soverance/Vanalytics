using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Economy;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class EconomyControllerTests : IAsyncLifetime
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

                    // Remove all background hosted services to prevent interference with test data
                    services.RemoveAll<IHostedService>();
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7",
                        ["SKIP_ITEM_SEED"] = "true",
                    });
                });
            });
        _client = _factory.CreateClient();

        // Seed a test item and server
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.GameItems.Add(new GameItem
        {
            ItemId = 4096,
            Name = "Fire Crystal",
            Category = "Crystal",
            StackSize = 12,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        db.GameServers.Add(new GameServer
        {
            Name = "Asura",
            Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<string> GetApiKeyAsync()
    {
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = "econ@test.com", Username = "econuser", Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        return (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;
    }

    [Fact]
    public async Task IngestAh_AcceptsSales()
    {
        var apiKey = await GetApiKeyAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales =
            [
                new AhSaleEntry
                {
                    Price = 2000,
                    SoldAt = DateTimeOffset.UtcNow.AddHours(-1),
                    SellerName = "SellerA",
                    BuyerName = "BuyerB",
                    StackSize = 1,
                }
            ],
        });

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var result = await resp.Content.ReadFromJsonAsync<AhIngestionResponse>();
        Assert.Equal(1, result!.Accepted);
        Assert.Equal(0, result.Duplicates);
    }

    [Fact]
    public async Task IngestAh_DeduplicatesSales()
    {
        var apiKey = await GetApiKeyAsync();
        var soldAt = DateTimeOffset.UtcNow.AddHours(-2);

        var payload = new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales =
            [
                new AhSaleEntry { Price = 3000, SoldAt = soldAt, SellerName = "S", BuyerName = "B", StackSize = 1 }
            ],
        };

        var req1 = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req1.Headers.Add("X-Api-Key", apiKey);
        req1.Content = JsonContent.Create(payload);
        await _client.SendAsync(req1);

        var req2 = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req2.Headers.Add("X-Api-Key", apiKey);
        req2.Content = JsonContent.Create(payload);
        var resp = await _client.SendAsync(req2);

        var result = await resp.Content.ReadFromJsonAsync<AhIngestionResponse>();
        Assert.Equal(0, result!.Accepted);
        Assert.Equal(1, result.Duplicates);
    }

    [Fact]
    public async Task IngestAh_WithoutApiKey_ReturnsUnauthorized()
    {
        var resp = await _client.PostAsJsonAsync("/api/economy/ah", new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales = [],
        });
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task IngestAh_UnknownServer_ReturnsBadRequest()
    {
        var apiKey = await GetApiKeyAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "FakeServer",
            Sales = [new AhSaleEntry { Price = 100, SoldAt = DateTimeOffset.UtcNow, SellerName = "S", BuyerName = "B" }],
        });

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
