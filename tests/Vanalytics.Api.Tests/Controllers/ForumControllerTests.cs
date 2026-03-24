using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Forum.DTOs;
using Testcontainers.MsSql;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ForumControllerTests : IAsyncLifetime
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

    private async Task<string> RegisterAndGetTokenAsync(string email, string username)
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = await resp.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    private HttpRequestMessage Authed(HttpMethod method, string url, string token, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body != null)
            req.Content = JsonContent.Create(body);
        return req;
    }

    private async Task PromoteToModeratorAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var user = await db.Users.FirstAsync(u => u.Email == email);
        user.Role = UserRole.Moderator;
        await db.SaveChangesAsync();
    }

    private async Task<string> GetModeratorTokenAsync(string email, string username)
    {
        await RegisterAndGetTokenAsync(email, username);
        await PromoteToModeratorAsync(email);

        // Re-login to get a token with the updated Moderator role claim
        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        { Email = email, Password = "Password123!" });
        var auth = await loginResp.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    // ===== Tests =====

    [Fact]
    public async Task GetCategories_NoAuth_Returns200()
    {
        var resp = await _client.GetAsync("/api/forum/categories");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetCategory_NotFound_Returns404()
    {
        var resp = await _client.GetAsync("/api/forum/categories/nonexistent-slug-xyz");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task CreateThread_NoAuth_Returns401()
    {
        var resp = await _client.PostAsJsonAsync("/api/forum/categories/some-category/threads",
            new CreateThreadRequest("Test Title", "Test body"));

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task CreateCategory_MemberRole_Returns403()
    {
        var token = await RegisterAndGetTokenAsync("member1@test.com", "member1");

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", token,
            new CreateCategoryRequest("Test Category", "A description")));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task CreateCategory_Moderator_Returns201()
    {
        var token = await GetModeratorTokenAsync("mod1@test.com", "mod1");

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", token,
            new CreateCategoryRequest("Moderator Category", "Created by mod")));

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var category = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Moderator Category", category.GetProperty("name").GetString());
    }

    [Fact]
    public async Task CreateThread_Authenticated_Returns201()
    {
        var modToken = await GetModeratorTokenAsync("mod2@test.com", "mod2");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("Thread Test Category", "For thread tests")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var slug = cat.GetProperty("slug").GetString()!;

        var memberToken = await RegisterAndGetTokenAsync("member2@test.com", "member2");

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{slug}/threads", memberToken,
            new CreateThreadRequest("My First Thread", "Thread body content here.")));

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var thread = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("My First Thread", thread.GetProperty("title").GetString());
    }

    [Fact]
    public async Task GetPosts_ReturnsEnrichedPosts()
    {
        var modToken = await GetModeratorTokenAsync("mod3@test.com", "mod3");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("Posts Test Category", "For post tests")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await RegisterAndGetTokenAsync("member3@test.com", "member3");
        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("Enriched Posts Thread", "Opening post body.")));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        var postsResp = await _client.GetAsync($"/api/forum/threads/{threadId}/posts");

        Assert.Equal(HttpStatusCode.OK, postsResp.StatusCode);
        var body = await postsResp.Content.ReadFromJsonAsync<JsonElement>();
        var posts = body.GetProperty("posts");
        Assert.True(posts.GetArrayLength() > 0);
        var firstPost = posts[0];
        var authorUsername = firstPost.GetProperty("authorUsername").GetString();
        Assert.Equal("member3", authorUsername);
    }

    [Fact]
    public async Task CreatePost_LockedThread_Returns409()
    {
        var modToken = await GetModeratorTokenAsync("mod4@test.com", "mod4");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("Lock Test Category", "For lock tests")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await RegisterAndGetTokenAsync("member4@test.com", "member4");
        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("Thread to Lock", "This will be locked.")));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        // Lock the thread as moderator
        var lockResp = await _client.SendAsync(Authed(HttpMethod.Put, $"/api/forum/threads/{threadId}/lock", modToken));
        Assert.Equal(HttpStatusCode.OK, lockResp.StatusCode);

        // Try to post in the locked thread
        var postResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts", memberToken,
            new CreatePostRequest("Posting to locked thread.")));

        Assert.Equal(HttpStatusCode.Conflict, postResp.StatusCode);
    }

    [Fact]
    public async Task ToggleVote_AuthenticatedUser_TogglesVote()
    {
        var modToken = await GetModeratorTokenAsync("mod5@test.com", "mod5");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("Vote Test Category", "For vote tests")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await RegisterAndGetTokenAsync("member5@test.com", "member5");
        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("Vote Thread", "Vote thread body.")));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        // Get the post ID from the thread's posts
        var postsResp = await _client.GetAsync($"/api/forum/threads/{threadId}/posts");
        var postsBody = await postsResp.Content.ReadFromJsonAsync<JsonElement>();
        var postId = postsBody.GetProperty("posts")[0].GetProperty("id").GetInt64();

        // Vote once — expect count=1, voted=true
        var vote1Resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/posts/{postId}/vote", memberToken));
        Assert.Equal(HttpStatusCode.OK, vote1Resp.StatusCode);
        var vote1 = await vote1Resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, vote1.GetProperty("voteCount").GetInt32());
        Assert.True(vote1.GetProperty("userVoted").GetBoolean());

        // Vote again — expect count=0, voted=false
        var vote2Resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/posts/{postId}/vote", memberToken));
        Assert.Equal(HttpStatusCode.OK, vote2Resp.StatusCode);
        var vote2 = await vote2Resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, vote2.GetProperty("voteCount").GetInt32());
        Assert.False(vote2.GetProperty("userVoted").GetBoolean());
    }

    [Fact]
    public async Task CreateThread_EmptyTitle_Returns400()
    {
        var modToken = await GetModeratorTokenAsync("mod6@test.com", "mod6");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("Empty Title Category", "For empty title test")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await RegisterAndGetTokenAsync("member6@test.com", "member6");

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("", "Body content here.")));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Vote_NoAuth_Returns401()
    {
        var resp = await _client.PostAsJsonAsync("/api/forum/posts/999/vote", new { });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
