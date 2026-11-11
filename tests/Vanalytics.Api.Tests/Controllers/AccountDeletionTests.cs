using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AccountDeletionTests : IAsyncLifetime
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

    // --- helpers ---

    private async Task<User> SeedUserAsync(string email, string username, UserRole role = UserRole.Member,
        string? apiKey = null, int characters = 0)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = PasswordHasher.HashPassword("Password123!"),
            Role = role,
            ApiKey = apiKey,
            ApiKeyLookup = apiKey is null ? null : new string('a', 64),
            ApiKeyCreatedAt = apiKey is null ? null : DateTimeOffset.UtcNow.AddDays(-3),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        for (var i = 0; i < characters; i++)
            db.Characters.Add(new Character { Id = Guid.NewGuid(), UserId = user.Id, Name = $"{username}Char{i}", Server = "Asura" });
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<AuthResponse> LoginAsync(string email)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = "Password123!" });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string token, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) req.Content = JsonContent.Create(body);
        return _client.SendAsync(req);
    }

    private async Task<T> WithDbAsync<T>(Func<VanalyticsDbContext, Task<T>> f)
    {
        using var scope = _factory.Services.CreateScope();
        return await f(scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>());
    }

    private record StatusDto(bool Pending, DateTimeOffset? ScheduledFor);
    private record AdminStatusDto(string Status, string? Error);
    private record AcceptedDto(int CharacterCount);

    // --- self-service ---

    [Fact]
    public async Task Request_WithWrongUsername_Returns400_AndSchedulesNothing()
    {
        var user = await SeedUserAsync("a@example.com", "alice");
        var auth = await LoginAsync("a@example.com");

        var res = await SendAsync(HttpMethod.Post, "/api/account/deletion", auth.AccessToken, new { confirmUsername = "bob" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.False(await WithDbAsync(db => db.AccountDeletionRequests.AnyAsync(r => r.UserId == user.Id)));
    }

    [Fact]
    public async Task Request_SchedulesSevenDaysOut_ParksApiKey_AndRevokesSessions()
    {
        var user = await SeedUserAsync("a@example.com", "alice", apiKey: "hashed-key");
        var auth = await LoginAsync("a@example.com");

        // Username match is case-insensitive.
        var res = await SendAsync(HttpMethod.Post, "/api/account/deletion", auth.AccessToken, new { confirmUsername = " ALICE " });
        res.EnsureSuccessStatusCode();
        var body = (await res.Content.ReadFromJsonAsync<StatusDto>())!;
        Assert.True(body.Pending);
        Assert.InRange(body.ScheduledFor!.Value, DateTimeOffset.UtcNow.AddDays(6.9), DateTimeOffset.UtcNow.AddDays(7.1));

        var (dbUser, request) = await WithDbAsync(async db => (
            await db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id),
            await db.AccountDeletionRequests.AsNoTracking().FirstAsync(r => r.UserId == user.Id)));
        Assert.Null(dbUser.ApiKey);
        Assert.Null(dbUser.ApiKeyLookup);
        Assert.Equal("hashed-key", request.ParkedApiKey);
        Assert.False(request.RequestedByAdmin);

        // The refresh token from before the request no longer works.
        var refresh = await _client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Cancel_RemovesRequest_AndRestoresApiKey()
    {
        var user = await SeedUserAsync("a@example.com", "alice", apiKey: "hashed-key");
        var auth = await LoginAsync("a@example.com");
        (await SendAsync(HttpMethod.Post, "/api/account/deletion", auth.AccessToken, new { confirmUsername = "alice" })).EnsureSuccessStatusCode();

        // Signing back in during the grace period works, and status reports pending.
        var again = await LoginAsync("a@example.com");
        var status = (await (await SendAsync(HttpMethod.Get, "/api/account/deletion", again.AccessToken)).Content.ReadFromJsonAsync<StatusDto>())!;
        Assert.True(status.Pending);

        var cancel = await SendAsync(HttpMethod.Delete, "/api/account/deletion", again.AccessToken);
        cancel.EnsureSuccessStatusCode();

        var dbUser = await WithDbAsync(db => db.Users.AsNoTracking().FirstAsync(u => u.Id == user.Id));
        Assert.Equal("hashed-key", dbUser.ApiKey);
        Assert.Equal(new string('a', 64), dbUser.ApiKeyLookup);
        Assert.False(await WithDbAsync(db => db.AccountDeletionRequests.AnyAsync(r => r.UserId == user.Id)));
    }

    [Fact]
    public async Task Cancel_WhileProcessing_Returns409()
    {
        var user = await SeedUserAsync("a@example.com", "alice");
        var auth = await LoginAsync("a@example.com");
        (await SendAsync(HttpMethod.Post, "/api/account/deletion", auth.AccessToken, new { confirmUsername = "alice" })).EnsureSuccessStatusCode();
        await WithDbAsync(db => db.AccountDeletionRequests.Where(r => r.UserId == user.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ProcessingStartedAt, DateTimeOffset.UtcNow)));

        var again = await LoginAsync("a@example.com");
        var cancel = await SendAsync(HttpMethod.Delete, "/api/account/deletion", again.AccessToken);

        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);
    }

    [Fact]
    public async Task Request_ByAdmin_Returns400()
    {
        await SeedUserAsync("admin@example.com", "adminuser", UserRole.Admin);
        var auth = await LoginAsync("admin@example.com");

        var res = await SendAsync(HttpMethod.Post, "/api/account/deletion", auth.AccessToken, new { confirmUsername = "adminuser" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // --- admin delete ---

    [Fact]
    public async Task AdminDelete_Returns202_ThenStatusReportsDeleted_AndDataIsGone()
    {
        await SeedUserAsync("admin@example.com", "adminuser", UserRole.Admin);
        var admin = await LoginAsync("admin@example.com");
        var victim = await SeedUserAsync("v@example.com", "victim", characters: 3);

        var res = await SendAsync(HttpMethod.Delete, $"/api/admin/users/{victim.Id}", admin.AccessToken);
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        Assert.Equal(3, (await res.Content.ReadFromJsonAsync<AcceptedDto>())!.CharacterCount);

        AdminStatusDto? status = null;
        for (var i = 0; i < 40; i++)
        {
            status = await (await SendAsync(HttpMethod.Get, $"/api/admin/users/{victim.Id}/deletion", admin.AccessToken))
                .Content.ReadFromJsonAsync<AdminStatusDto>();
            if (status!.Status is "deleted" or "failed") break;
            await Task.Delay(250);
        }

        Assert.Equal("deleted", status!.Status);
        Assert.False(await WithDbAsync(db => db.Users.AnyAsync(u => u.Id == victim.Id)));
        Assert.False(await WithDbAsync(db => db.Characters.AnyAsync(c => c.UserId == victim.Id)));
    }

    // --- sweep ---

    [Fact]
    public async Task ProcessDue_DeletesOnlyAccountsPastTheirGracePeriod()
    {
        var due = await SeedUserAsync("due@example.com", "due", characters: 2);
        var notDue = await SeedUserAsync("later@example.com", "later", characters: 1);
        await WithDbAsync(async db =>
        {
            db.AccountDeletionRequests.Add(new AccountDeletionRequest { UserId = due.Id, RequestedAt = DateTimeOffset.UtcNow.AddDays(-8), ScheduledFor = DateTimeOffset.UtcNow.AddMinutes(-1) });
            db.AccountDeletionRequests.Add(new AccountDeletionRequest { UserId = notDue.Id, RequestedAt = DateTimeOffset.UtcNow, ScheduledFor = DateTimeOffset.UtcNow.AddDays(7) });
            return await db.SaveChangesAsync();
        });

        var runner = _factory.Services.GetRequiredService<AccountDeletionRunner>();
        var deleted = await runner.ProcessDueAsync(CancellationToken.None);

        Assert.Equal(1, deleted);
        Assert.False(await WithDbAsync(db => db.Users.AnyAsync(u => u.Id == due.Id)));
        Assert.True(await WithDbAsync(db => db.Users.AnyAsync(u => u.Id == notDue.Id)));
        Assert.Equal(1, await WithDbAsync(db => db.Characters.CountAsync(c => c.UserId == notDue.Id)));
    }
}
