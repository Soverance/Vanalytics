using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AddonControllerTests : IAsyncLifetime
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

    [Fact]
    public async Task Manifest_ReturnsVersionAndFiles()
    {
        var response = await _client.GetAsync("/api/addon/manifest");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.TryGetProperty("version", out var version));
        Assert.False(string.IsNullOrWhiteSpace(version.GetString()));

        Assert.True(json.TryGetProperty("files", out var files));
        Assert.True(files.GetArrayLength() > 0);

        // Each entry has a non-empty path and a non-negative size.
        foreach (var f in files.EnumerateArray())
        {
            Assert.True(f.TryGetProperty("path", out var path));
            Assert.False(string.IsNullOrWhiteSpace(path.GetString()));
            Assert.True(f.TryGetProperty("size", out var size));
            Assert.True(size.GetInt64() >= 0);
        }
    }

    [Fact]
    public async Task Manifest_IncludesVanalyticsLua()
    {
        var json = await _client.GetFromJsonAsync<JsonElement>("/api/addon/manifest");
        var paths = json.GetProperty("files").EnumerateArray()
            .Select(f => f.GetProperty("path").GetString())
            .ToList();
        Assert.Contains("vanalytics.lua", paths);
    }

    [Fact]
    public async Task Manifest_ExcludesSettingsXml()
    {
        var json = await _client.GetFromJsonAsync<JsonElement>("/api/addon/manifest");
        var paths = json.GetProperty("files").EnumerateArray()
            .Select(f => f.GetProperty("path").GetString())
            .ToList();
        // Confirm settings.xml is actually present server-side so the exclusion
        // assertion below is non-vacuous (not just "absent ⇒ not in manifest").
        Assert.True(System.IO.File.Exists(
            System.IO.Path.Combine(AppContext.BaseDirectory, "addon", "settings.xml")));
        Assert.DoesNotContain("settings.xml", paths);
    }

    [Fact]
    public async Task File_ServesKnownFileBytes()
    {
        // Size from the manifest must match the bytes returned by /file.
        var manifest = await _client.GetFromJsonAsync<JsonElement>("/api/addon/manifest");
        var entry = manifest.GetProperty("files").EnumerateArray()
            .First(f => f.GetProperty("path").GetString() == "vanalytics.lua");
        var expectedSize = entry.GetProperty("size").GetInt64();

        var response = await _client.GetAsync("/api/addon/file?path=vanalytics.lua");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(expectedSize, bytes.LongLength);
    }

    [Fact]
    public async Task File_RejectsSettingsXml()
    {
        var response = await _client.GetAsync("/api/addon/file?path=settings.xml");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // The %2F entry is pre-encoded on purpose: it reaches the server as encoded "/" traversal.
    [Theory]
    [InlineData("../Program.cs")]
    [InlineData("..%2F..%2Fappsettings.json")]
    [InlineData("/etc/passwd")]
    [InlineData("does-not-exist.lua")]
    public async Task File_RejectsTraversalAndUnknown(string path)
    {
        var response = await _client.GetAsync($"/api/addon/file?path={path}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task File_MissingPathParam_ReturnsBadRequest()
    {
        var response = await _client.GetAsync("/api/addon/file");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
