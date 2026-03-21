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
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class KeysControllerTests : IAsyncLifetime
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

    private async Task<string> RegisterAndGetTokenAsync(string email, string username)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = email,
            Username = username,
            Password = "Password123!"
        });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private HttpRequestMessage AuthedRequest(HttpMethod method, string url, string token)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    [Fact]
    public async Task Generate_WithAuth_ReturnsApiKey()
    {
        var token = await RegisterAndGetTokenAsync("keygen@example.com", "keygen");

        var response = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var keyResponse = await response.Content.ReadFromJsonAsync<ApiKeyResponse>();
        Assert.NotNull(keyResponse);
        Assert.NotEmpty(keyResponse.ApiKey);
    }

    [Fact]
    public async Task Generate_Twice_InvalidatesOldKey()
    {
        var token = await RegisterAndGetTokenAsync("keygen2@example.com", "keygen2");

        var response1 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var key1 = (await response1.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;

        var response2 = await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var key2 = (await response2.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;

        Assert.NotEqual(key1, key2);
    }

    [Fact]
    public async Task Revoke_WithAuth_RemovesApiKey()
    {
        var token = await RegisterAndGetTokenAsync("revoke@example.com", "revoke");

        await _client.SendAsync(AuthedRequest(HttpMethod.Post, "/api/keys/generate", token));
        var response = await _client.SendAsync(AuthedRequest(HttpMethod.Delete, "/api/keys", token));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        // Verify key is gone via profile
        var profileResponse = await _client.SendAsync(AuthedRequest(HttpMethod.Get, "/api/auth/me", token));
        var profile = await profileResponse.Content.ReadFromJsonAsync<UserProfileResponse>();
        Assert.False(profile!.HasApiKey);
    }

    [Fact]
    public async Task Generate_WithoutAuth_ReturnsUnauthorized()
    {
        var response = await _client.PostAsync("/api/keys/generate", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
