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
using Vanalytics.Api.Services;
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

                    // Force local storage implementations in tests (user secrets may provide Azure connection string)
                    var imageStoreDesc = services.SingleOrDefault(d => d.ServiceType == typeof(IItemImageStore));
                    if (imageStoreDesc != null) services.Remove(imageStoreDesc);
                    services.AddSingleton<IItemImageStore, LocalItemImageStore>();

                    var attachmentStoreDesc = services.SingleOrDefault(d => d.ServiceType == typeof(IForumAttachmentStore));
                    if (attachmentStoreDesc != null) services.Remove(attachmentStoreDesc);
                    services.AddSingleton<IForumAttachmentStore, LocalForumAttachmentStore>();
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
                        ["AzureStorage:ConnectionString"] = null
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

    private async Task<string> CreateUserAndGetTokenAsync(string email, string username, string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
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
        await CreateUserAndGetTokenAsync(email, username);
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
        var token = await CreateUserAndGetTokenAsync("member1@test.com", "member1");

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

        var memberToken = await CreateUserAndGetTokenAsync("member2@test.com", "member2");

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

        var memberToken = await CreateUserAndGetTokenAsync("member3@test.com", "member3");
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

        var memberToken = await CreateUserAndGetTokenAsync("member4@test.com", "member4");
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

        var memberToken = await CreateUserAndGetTokenAsync("member5@test.com", "member5");
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

        var memberToken = await CreateUserAndGetTokenAsync("member6@test.com", "member6");

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

    [Fact]
    public async Task Search_EmptyQuery_Returns400()
    {
        var resp = await _client.GetAsync("/api/forum/search?q=ab");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Search_NoResults_ReturnsEmptyList()
    {
        var resp = await _client.GetAsync("/api/forum/search?q=zzzznonexistent");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("results").GetArrayLength());
        Assert.False(json.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public async Task Search_MatchesThreadTitle()
    {
        var modToken = await GetModeratorTokenAsync("search1@test.com", "searchmod1");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories", modToken,
                new CreateCategoryRequest("SearchCat", "")));

        var memberToken = await CreateUserAndGetTokenAsync("searchmem1@test.com", "searchmem1");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories/searchcat/threads", memberToken,
                new CreateThreadRequest("UniqueSearchableTitle", "Some body content")));

        var resp = await _client.GetAsync("/api/forum/search?q=UniqueSearchableTitle");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var results = json.GetProperty("results");
        Assert.True(results.GetArrayLength() > 0);
        Assert.Equal("UniqueSearchableTitle", results[0].GetProperty("threadTitle").GetString());
    }

    [Fact]
    public async Task Search_MatchesPostBody()
    {
        var modToken = await GetModeratorTokenAsync("search2@test.com", "searchmod2");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories", modToken,
                new CreateCategoryRequest("SearchCat2", "")));

        var memberToken = await CreateUserAndGetTokenAsync("searchmem2@test.com", "searchmem2");
        await _client.SendAsync(
            Authed(HttpMethod.Post, "/api/forum/categories/searchcat2/threads", memberToken,
                new CreateThreadRequest("Normal Title", "VeryUniqueBodyContent12345")));

        var resp = await _client.GetAsync("/api/forum/search?q=VeryUniqueBodyContent12345");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.GetProperty("results").GetArrayLength() > 0);
    }

    // ===== Attachment Upload Tests =====

    [Fact]
    public async Task CreatePost_TooManyImages_Returns400()
    {
        var token = await GetModeratorTokenAsync("imgposter@test.com", "imgposter");

        // Create a category and thread first
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories",
            token, new { name = "ImgTest", description = "Test", displayOrder = 1 }));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString();

        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads",
            token, new { title = "Image Thread", body = "First post" }));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        // Build body with 6 images (over limit of 5)
        var imgs = string.Join("", Enumerable.Range(0, 6).Select(i =>
            $"<img src=\"/forum-attachments/attachments/{Guid.NewGuid()}.png\">"));
        var body = $"<p>Too many images</p>{imgs}";

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts",
            token, new { body }));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_Unauthenticated_Returns401()
    {
        var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(new byte[] { 1, 2, 3 }), "file", "test.png");

        var resp = await _client.PostAsync("/api/forum/attachments", content);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_NoFile_Returns400()
    {
        var token = await CreateUserAndGetTokenAsync("uploader@test.com", "uploader");
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = new MultipartFormDataContent();

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_TooLarge_Returns400()
    {
        var token = await CreateUserAndGetTokenAsync("uploader2@test.com", "uploader2");
        var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[6 * 1024 * 1024]); // 6MB
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        content.Add(fileContent, "file", "big.png");

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = content;

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_InvalidType_Returns400()
    {
        var token = await CreateUserAndGetTokenAsync("uploader3@test.com", "uploader3");
        var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        content.Add(fileContent, "file", "doc.pdf");

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = content;

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task UploadAttachment_ValidImage_ReturnsIdAndUrl()
    {
        var token = await CreateUserAndGetTokenAsync("uploader4@test.com", "uploader4");
        var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[] { 137, 80, 78, 71 }); // PNG magic bytes
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        content.Add(fileContent, "file", "screenshot.png");

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/forum/attachments");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = content;

        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var result = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.TryGetProperty("id", out _));
        Assert.True(result.TryGetProperty("url", out _));
    }

    [Fact]
    public async Task GetPosts_HidesDeletedPosts_ForRegularUsers()
    {
        // Arrange: create category, thread, reply, then soft-delete the reply
        var modToken = await GetModeratorTokenAsync("delmod1@test.com", "delmod1");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("DelTest1", "For deletion test")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await CreateUserAndGetTokenAsync("delmem1@test.com", "delmem1");
        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("Deletion Test", "First post body")));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        // Create a reply as member
        var replyResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts", memberToken,
            new CreatePostRequest("This reply will be deleted")));
        var reply = await replyResp.Content.ReadFromJsonAsync<JsonElement>();
        var replyId = reply.GetProperty("id").GetInt64();

        // Soft-delete the reply via moderator
        await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/forum/posts/{replyId}/moderate", modToken));

        // Act: fetch posts as regular user
        var postsResp = await _client.GetFromJsonAsync<JsonElement>($"/api/forum/threads/{threadId}/posts");
        var posts = postsResp.GetProperty("posts").EnumerateArray().ToList();

        // Assert: deleted post should NOT be visible
        Assert.All(posts, p => Assert.False(p.GetProperty("isDeleted").GetBoolean()));
    }

    [Fact]
    public async Task GetPosts_ShowsDeletedPosts_ForModerators()
    {
        // Arrange: create category, thread, reply, then soft-delete the reply
        var modToken = await GetModeratorTokenAsync("delmod2@test.com", "delmod2");
        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories", modToken,
            new CreateCategoryRequest("DelTest2", "For deletion mod test")));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString()!;

        var memberToken = await CreateUserAndGetTokenAsync("delmem2@test.com", "delmem2");
        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads", memberToken,
            new CreateThreadRequest("Deletion Mod Test", "First post body")));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        // Create a reply as member
        var replyResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts", memberToken,
            new CreatePostRequest("This reply will be deleted")));
        var reply = await replyResp.Content.ReadFromJsonAsync<JsonElement>();
        var replyId = reply.GetProperty("id").GetInt64();

        // Soft-delete the reply via moderator
        await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/forum/posts/{replyId}/moderate", modToken));

        // Act: fetch posts as moderator (set auth header for GetFromJsonAsync)
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", modToken);
        var postsResp = await _client.GetFromJsonAsync<JsonElement>($"/api/forum/threads/{threadId}/posts");
        _client.DefaultRequestHeaders.Authorization = null;
        var posts = postsResp.GetProperty("posts").EnumerateArray().ToList();

        // Assert: should see the deleted post with null body
        var deletedPost = posts.First(p => p.GetProperty("id").GetInt64() == replyId);
        Assert.True(deletedPost.GetProperty("isDeleted").GetBoolean());
        Assert.Equal(JsonValueKind.Null, deletedPost.GetProperty("body").ValueKind);
    }

    [Fact]
    public async Task CreatePost_ExternalImageStripped()
    {
        var token = await GetModeratorTokenAsync("sanitize@test.com", "sanitize");

        var catResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/forum/categories",
            token, new { name = "SanitizeTest", description = "Test", displayOrder = 2 }));
        var cat = await catResp.Content.ReadFromJsonAsync<JsonElement>();
        var catSlug = cat.GetProperty("slug").GetString();

        var threadResp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/categories/{catSlug}/threads",
            token, new { title = "Sanitize Thread", body = "First" }));
        var thread = await threadResp.Content.ReadFromJsonAsync<JsonElement>();
        var threadId = thread.GetProperty("id").GetInt32();

        var body = "<p>Check this</p><img src=\"https://evil.com/tracker.png\"><img src=\"/forum-attachments/attachments/good.png\">";

        var resp = await _client.SendAsync(Authed(HttpMethod.Post, $"/api/forum/threads/{threadId}/posts",
            token, new { body }));

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var post = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var resultBody = post.GetProperty("body").GetString()!;
        Assert.DoesNotContain("evil.com", resultBody);
        Assert.Contains("/forum-attachments/attachments/good.png", resultBody);
    }
}
