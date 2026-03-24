using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Soverance.Forum.DTOs;
using Soverance.Forum.Services;
using Vanalytics.Api.DTOs;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/forum")]
public class ForumController : ControllerBase
{
    private readonly IForumService _forum;
    private readonly IForumAuthorResolver _authors;

    public ForumController(IForumService forum, IForumAuthorResolver authors)
    {
        _forum = forum;
        _authors = authors;
    }

    // === Categories (Public) ===

    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        return Ok(await _forum.GetCategoriesAsync());
    }

    [HttpGet("categories/{slug}")]
    public async Task<IActionResult> GetCategory(string slug)
    {
        var category = await _forum.GetCategoryBySlugAsync(slug);
        return category != null ? Ok(category) : NotFound();
    }

    [HttpGet("categories/{slug}/threads")]
    public async Task<IActionResult> GetThreads(
        string slug,
        [FromQuery] long? afterLastPostAtTicks = null,
        [FromQuery] int? afterId = null,
        [FromQuery] int limit = 25)
    {
        var category = await _forum.GetCategoryBySlugAsync(slug);
        if (category == null) return NotFound();

        var (threads, hasMore) = await _forum.GetThreadsAsync(slug, afterLastPostAtTicks, afterId, limit);

        var authorIds = threads.Select(t => t.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        var enriched = threads.Select(t =>
        {
            var author = authors.GetValueOrDefault(t.AuthorId);
            return new EnrichedThreadSummaryResponse(
                t.Id, t.Title, t.Slug, t.IsPinned, t.IsLocked,
                t.AuthorId, t.ReplyCount, t.VoteCount,
                t.CreatedAt, t.LastPostAt,
                author?.Username ?? "[deleted]",
                author?.AvatarHash);
        }).ToList();

        return Ok(new { threads = enriched, hasMore });
    }

    [HttpGet("categories/{categorySlug}/threads/{threadSlug}")]
    public async Task<IActionResult> GetThread(string categorySlug, string threadSlug)
    {
        var thread = await _forum.GetThreadBySlugAsync(categorySlug, threadSlug);
        if (thread == null) return NotFound();

        var authors = await _authors.ResolveAuthorsAsync([thread.AuthorId]);
        var author = authors.GetValueOrDefault(thread.AuthorId);

        return Ok(new EnrichedThreadDetailResponse(
            thread.Id, thread.Title, thread.Slug, thread.CategoryId, thread.CategoryName, thread.CategorySlug,
            thread.IsPinned, thread.IsLocked, thread.AuthorId,
            thread.CreatedAt, thread.LastPostAt,
            author?.Username ?? "[deleted]",
            author?.AvatarHash));
    }

    // === Posts (Public, with optional auth for vote status) ===

    [HttpGet("threads/{threadId}/posts")]
    public async Task<IActionResult> GetPosts(
        int threadId,
        [FromQuery] long? afterId = null,
        [FromQuery] int limit = 25)
    {
        var currentUserId = GetOptionalUserId();
        var (posts, hasMore) = await _forum.GetPostsAsync(threadId, afterId, limit, currentUserId);

        var authorIds = posts.Select(p => p.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        var enriched = posts.Select(p =>
        {
            var author = authors.GetValueOrDefault(p.AuthorId);
            return new EnrichedPostResponse(
                p.Id, p.AuthorId, p.Body, p.IsEdited, p.IsDeleted,
                p.VoteCount, p.CurrentUserVoted,
                p.CreatedAt, p.UpdatedAt,
                author?.Username ?? "[deleted]",
                author?.AvatarHash,
                author?.PostCount ?? 0,
                author?.JoinedAt ?? DateTimeOffset.MinValue);
        }).ToList();

        return Ok(new { posts = enriched, hasMore });
    }

    // === Threads (Authenticated) ===

    [Authorize]
    [HttpPost("categories/{slug}/threads")]
    public async Task<IActionResult> CreateThread(string slug, [FromBody] CreateThreadRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 200)
            return BadRequest(new { error = "Title is required and must be 200 characters or less." });
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        var thread = await _forum.CreateThreadAsync(slug, request, GetUserId());
        if (thread == null) return NotFound();

        return StatusCode(201, thread);
    }

    // === Posts (Authenticated) ===

    [Authorize]
    [HttpPost("threads/{threadId}/posts")]
    public async Task<IActionResult> CreatePost(int threadId, [FromBody] CreatePostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        var post = await _forum.CreatePostAsync(threadId, request, GetUserId());
        if (post == null) return Conflict(new { error = "Thread not found or is locked." });

        return StatusCode(201, post);
    }

    [Authorize]
    [HttpPut("posts/{postId}")]
    public async Task<IActionResult> EditPost(long postId, [FromBody] UpdatePostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        var result = await _forum.UpdatePostAsync(postId, request, GetUserId(), false);
        if (result == null) return NotFound();

        return Ok(result);
    }

    [Authorize]
    [HttpDelete("posts/{postId}")]
    public async Task<IActionResult> DeletePost(long postId)
    {
        var result = await _forum.DeletePostAsync(postId, GetUserId(), false);
        if (!result) return NotFound();

        return NoContent();
    }

    // === Voting (Authenticated) ===

    [Authorize]
    [HttpPost("posts/{postId}/vote")]
    public async Task<IActionResult> ToggleVote(long postId)
    {
        var (count, voted) = await _forum.ToggleVoteAsync(postId, GetUserId());
        return Ok(new { voteCount = count, userVoted = voted });
    }

    // === Categories (Moderator+) ===

    [Authorize(Roles = "Moderator,Admin")]
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100)
            return BadRequest(new { error = "Name is required and must be 100 characters or less." });
        if (request.Description?.Length > 500)
            return BadRequest(new { error = "Description must be 500 characters or less." });

        var category = await _forum.CreateCategoryAsync(request);
        return StatusCode(201, category);
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpPut("categories/{id}")]
    public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100)
            return BadRequest(new { error = "Name is required and must be 100 characters or less." });
        if (request.Description?.Length > 500)
            return BadRequest(new { error = "Description must be 500 characters or less." });

        var result = await _forum.UpdateCategoryAsync(id, request);
        return result != null ? Ok(result) : NotFound();
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpDelete("categories/{id}")]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        var result = await _forum.DeleteCategoryAsync(id);
        if (!result) return Conflict(new { error = "Category not found or has threads." });

        return NoContent();
    }

    // === Thread Moderation (Moderator+) ===

    [Authorize(Roles = "Moderator,Admin")]
    [HttpPut("threads/{threadId}/pin")]
    public async Task<IActionResult> TogglePin(int threadId)
    {
        var result = await _forum.TogglePinAsync(threadId);
        return result ? Ok() : NotFound();
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpPut("threads/{threadId}/lock")]
    public async Task<IActionResult> ToggleLock(int threadId)
    {
        var result = await _forum.ToggleLockAsync(threadId);
        return result ? Ok() : NotFound();
    }

    // === Post Moderation (Moderator+) ===

    [Authorize(Roles = "Moderator,Admin")]
    [HttpPut("posts/{postId}/moderate")]
    public async Task<IActionResult> ModerateEditPost(long postId, [FromBody] UpdatePostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        var result = await _forum.UpdatePostAsync(postId, request, GetUserId(), true);
        return result != null ? Ok(result) : NotFound();
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpDelete("posts/{postId}/moderate")]
    public async Task<IActionResult> ModerateDeletePost(long postId)
    {
        var result = await _forum.DeletePostAsync(postId, GetUserId(), true);
        return result ? NoContent() : NotFound();
    }

    // === Helpers ===

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Guid? GetOptionalUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return sub != null ? Guid.Parse(sub) : null;
    }
}
