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
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Core.Enums;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class DiscoveryCidrsTests : IAsyncLifetime
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
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));

                    // Remove hosted services to prevent interference with test data
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
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<User> SeedUserAsync(
        string email, string username, UserRole role = UserRole.Member,
        string? password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = password is null ? null : PasswordHasher.HashPassword(password),
            Role = role,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<AuthResponse> LoginAsync(string email, string password)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    private async Task<string> AdminTokenAsync()
    {
        await SeedUserAsync("admin@example.com", "adminuser", UserRole.Admin);
        var auth = await LoginAsync("admin@example.com", "Password123!");
        return auth.AccessToken;
    }

    private async Task<string> MemberTokenAsync()
    {
        await SeedUserAsync("member@example.com", "memberuser", UserRole.Member);
        var auth = await LoginAsync("member@example.com", "Password123!");
        return auth.AccessToken;
    }

    private record CidrsResponse(string Cidrs);

    [Fact]
    public async Task PutThenGet_PersistsCidrs()
    {
        var token = await AdminTokenAsync();

        var put = new HttpRequestMessage(HttpMethod.Put, "/api/admin/economy/discovery/cidrs");
        put.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        put.Content = JsonContent.Create(new { cidrs = "10.0.0.0/30\n192.168.1.0/30" });
        var putResp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var get = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/discovery/cidrs");
        get.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var getResp = await _client.SendAsync(get);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var body = await getResp.Content.ReadFromJsonAsync<CidrsResponse>();
        Assert.Equal("10.0.0.0/30\n192.168.1.0/30", body!.Cidrs);
    }

    [Fact]
    public async Task Put_InvalidLine_Returns400_AndPersistsNothing()
    {
        var token = await AdminTokenAsync();

        var put = new HttpRequestMessage(HttpMethod.Put, "/api/admin/economy/discovery/cidrs");
        put.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        put.Content = JsonContent.Create(new { cidrs = "10.0.0.0/30\nnot-a-cidr" });
        var putResp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.BadRequest, putResp.StatusCode);
        Assert.Contains("not-a-cidr", await putResp.Content.ReadAsStringAsync());

        // Nothing persisted.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var s = await db.ScraperSettings.AsNoTracking().FirstAsync(x => x.Id == 1);
        Assert.True(string.IsNullOrEmpty(s.DiscoveryCidrsText));
    }

    [Fact]
    public async Task GetCidrs_RequiresAdmin_403ForMember()
    {
        var token = await MemberTokenAsync();
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/discovery/cidrs");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
