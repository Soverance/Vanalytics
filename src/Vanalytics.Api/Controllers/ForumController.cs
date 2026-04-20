using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Soverance.Forum.DTOs;
using Soverance.Forum.Models;
using Soverance.Forum.Services;
using Vanalytics.Api.DTOs;
using Vanalytics.Api.Services;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/forum")]
public class ForumController : ControllerBase
{
    private readonly IForumService _forum;
    private readonly IForumAuthorResolver _authors;
    private readonly IForumSearchService _search;
    private readonly IForumAttachmentStore _attachmentStore;

    public ForumController(IForumService forum, IForumAuthorResolver authors, IForumSearchService search, IForumAttachmentStore attachmentStore)
    {
        _forum = forum;
        _authors = authors;
        _search = search;
        _attachmentStore = attachmentStore;
    }

    // === Search (Public) ===

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string? q = null,
        [FromQuery] int? afterRank = null,
        [FromQuery] int? afterId = null,
        [FromQuery] int limit = 25)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 3)
            return BadRequest(new { error = "Search query must be at least 3 characters." });

        var (results, hasMore) = await _search.SearchAsync(q.Trim(), afterRank, afterId, limit);
        return Ok(new { results, hasMore });
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

        var isModerator = User.IsInRole("Moderator") || User.IsInRole("Admin");
        var (threads, hasMore) = await _forum.GetThreadsAsync(slug, afterLastPostAtTicks, afterId, limit, isModerator);

        var authorIds = threads.Select(t => t.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        var enriched = threads.Select(t =>
        {
            var author = authors.GetValueOrDefault(t.AuthorId);
            return new EnrichedThreadSummaryResponse(
                t.Id, t.Title, t.Slug, t.IsPinned, t.IsLocked, t.IsDeleted,
                t.AuthorId, t.ReplyCount, t.VoteCount,
                t.CreatedAt, t.LastPostAt,
                author?.Username ?? "[deleted]",
                author?.DisplayName,
                author?.AvatarHash);
        }).ToList();

        return Ok(new { threads = enriched, hasMore });
    }

    [HttpGet("categories/{categorySlug}/threads/{threadSlug}")]
    public async Task<IActionResult> GetThread(string categorySlug, string threadSlug)
    {
        var isModerator = User.IsInRole("Moderator") || User.IsInRole("Admin");
        var thread = await _forum.GetThreadBySlugAsync(categorySlug, threadSlug, isModerator);
        if (thread == null) return NotFound();

        var authors = await _authors.ResolveAuthorsAsync([thread.AuthorId]);
        var author = authors.GetValueOrDefault(thread.AuthorId);

        return Ok(new EnrichedThreadDetailResponse(
            thread.Id, thread.Title, thread.Slug, thread.CategoryId, thread.CategoryName, thread.CategorySlug,
            thread.IsPinned, thread.IsLocked, thread.IsDeleted, thread.CategoryIsSystem, thread.AuthorId,
            thread.CreatedAt, thread.LastPostAt,
            author?.Username ?? "[deleted]",
            author?.DisplayName,
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
        var isModerator = User.IsInRole("Moderator") || User.IsInRole("Admin");
        var (posts, hasMore) = await _forum.GetPostsAsync(threadId, afterId, limit, currentUserId, isModerator);

        var authorIds = posts.Select(p => p.AuthorId).Distinct();
        var authors = await _authors.ResolveAuthorsAsync(authorIds);

        // Resolve quoted posts for replies
        var replyToIds = posts
            .Where(p => p.ReplyToPostId.HasValue)
            .Select(p => p.ReplyToPostId!.Value)
            .Distinct()
            .ToList();

        var quotedPosts = new Dictionary<long, QuotedPostInfo>();
        if (replyToIds.Count > 0)
        {
            var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
            var quotedRaw = await db.Set<Soverance.Forum.Models.ForumPost>()
                .Where(p => replyToIds.Contains(p.Id))
                .Select(p => new { p.Id, p.AuthorId, p.Body, p.IsDeleted })
                .ToListAsync();

            var quotedAuthorIds = quotedRaw.Select(q => q.AuthorId).Distinct();
            var quotedAuthors = await _authors.ResolveAuthorsAsync(quotedAuthorIds);

            foreach (var q in quotedRaw)
            {
                var qAuthor = quotedAuthors.GetValueOrDefault(q.AuthorId);
                var body = q.IsDeleted ? "" : (q.Body.Length > 300 ? q.Body[..300] + "..." : q.Body);
                quotedPosts[q.Id] = new QuotedPostInfo(
                    q.Id,
                    qAuthor?.Username ?? "[deleted]",
                    qAuthor?.DisplayName,
                    body,
                    q.IsDeleted);
            }
        }

        var enriched = posts.Select(p =>
        {
            var author = authors.GetValueOrDefault(p.AuthorId);
            QuotedPostInfo? quoted = p.ReplyToPostId.HasValue
                ? quotedPosts.GetValueOrDefault(p.ReplyToPostId.Value)
                : null;
            return new EnrichedPostResponse(
                p.Id, p.AuthorId, p.Body, p.IsEdited, p.IsDeleted,
                p.Reactions, p.UserReactions,
                p.ReplyToPostId, quoted,
                p.CreatedAt, p.UpdatedAt,
                author?.Username ?? "[deleted]",
                author?.DisplayName,
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

        if (CountForumImages(request.Body) > MaxImagesPerPost)
            return BadRequest(new { error = $"Posts cannot contain more than {MaxImagesPerPost} images." });

        // Some categories (e.g. News) only allow admins to start new threads;
        // replies in the same category remain open to all authenticated users.
        var category = await _forum.GetCategoryBySlugAsync(slug);
        if (category == null) return NotFound();
        if (category.RequiresAdminForNewThreads && !User.IsInRole("Admin"))
            return Forbid();

        var sanitizedBody = SanitizeImageSources(request.Body);
        var sanitizedRequest = new CreateThreadRequest(request.Title, sanitizedBody);

        var thread = await _forum.CreateThreadAsync(slug, sanitizedRequest, GetUserId());
        if (thread == null) return NotFound();

        // Link attachments to the first post created with the thread
        var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
        var firstPost = await db.Set<ForumPost>()
            .Where(p => p.ThreadId == thread.Id)
            .OrderBy(p => p.Id)
            .FirstOrDefaultAsync();
        if (firstPost != null)
            await LinkAttachmentsToPost(db, sanitizedBody, firstPost.Id);

        return StatusCode(201, thread);
    }

    // === Posts (Authenticated) ===

    [Authorize]
    [HttpPost("threads/{threadId}/posts")]
    public async Task<IActionResult> CreatePost(int threadId, [FromBody] CreatePostRequest request)
    {
        var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();

        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        if (CountForumImages(request.Body) > MaxImagesPerPost)
            return BadRequest(new { error = $"Posts cannot contain more than {MaxImagesPerPost} images." });

        // Validate replyToPostId if provided (must exist and belong to same thread)
        if (request.ReplyToPostId.HasValue)
        {
            var replyTargetExists = await db.Set<Soverance.Forum.Models.ForumPost>()
                .AnyAsync(p => p.Id == request.ReplyToPostId.Value && p.ThreadId == threadId);
            if (!replyTargetExists)
                return BadRequest(new { error = "Quoted post not found or does not belong to this thread." });
        }

        var sanitizedBody = SanitizeImageSources(request.Body);
        var sanitizedRequest = new CreatePostRequest(sanitizedBody, request.ReplyToPostId);

        var post = await _forum.CreatePostAsync(threadId, sanitizedRequest, GetUserId());
        if (post == null) return Conflict(new { error = "Thread not found or is locked." });

        if (post != null)
        {
            await LinkAttachmentsToPost(db, sanitizedBody, post.Id);
        }

        return StatusCode(201, post);
    }

    [Authorize]
    [HttpPut("posts/{postId}")]
    public async Task<IActionResult> EditPost(long postId, [FromBody] UpdatePostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return BadRequest(new { error = "Body is required." });

        if (CountForumImages(request.Body) > MaxImagesPerPost)
            return BadRequest(new { error = $"Posts cannot contain more than {MaxImagesPerPost} images." });

        var sanitizedBody = SanitizeImageSources(request.Body);
        var sanitizedRequest = new UpdatePostRequest(sanitizedBody);

        var result = await _forum.UpdatePostAsync(postId, sanitizedRequest, GetUserId(), false);
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

    // === Attachments (Authenticated) ===

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };

    private const long MaxFileSize = 5 * 1024 * 1024; // 5 MB

    [Authorize]
    [HttpPost("attachments")]
    public async Task<IActionResult> UploadAttachment(IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        if (file.Length > MaxFileSize)
            return BadRequest(new { error = "File size exceeds 5 MB limit." });

        if (!AllowedContentTypes.Contains(file.ContentType))
            return BadRequest(new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext)) ext = ".png";
        var storagePath = $"attachments/{Guid.NewGuid()}{ext}";

        using var stream = file.OpenReadStream();
        var url = await _attachmentStore.SaveAsync(storagePath, stream, file.ContentType);

        var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
        var attachment = new ForumAttachment
        {
            FileName = file.FileName,
            StoragePath = storagePath,
            ContentType = file.ContentType,
            FileSize = file.Length,
            UploadedBy = GetUserId(),
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Set<ForumAttachment>().Add(attachment);
        await db.SaveChangesAsync();

        return Ok(new { id = attachment.Id, url });
    }

    // === Reactions (Authenticated) ===

    [Authorize]
    [HttpPost("posts/{postId}/react")]
    public async Task<IActionResult> ToggleReaction(long postId, [FromBody] ReactRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ReactionType))
            return BadRequest(new { error = "reactionType is required." });

        try
        {
            var (reactions, userReactions) = await _forum.ToggleReactionAsync(postId, GetUserId(), request.ReactionType);
            return Ok(new { reactions, userReactions });
        }
        catch (ArgumentException)
        {
            return BadRequest(new { error = "Invalid reaction type. Valid types: like, thanks, funny." });
        }
    }

    public record ReactRequest(string ReactionType);

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

        var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
        var category = await db.Set<ForumCategory>().FindAsync(id);
        if (category == null) return NotFound();
        if (category.IsSystem) return BadRequest(new { error = "System categories cannot be modified." });

        var result = await _forum.UpdateCategoryAsync(id, request);
        return result != null ? Ok(result) : NotFound();
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpDelete("categories/{id}")]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        var db = HttpContext.RequestServices.GetRequiredService<VanalyticsDbContext>();
        var category = await db.Set<ForumCategory>().FindAsync(id);
        if (category == null) return NotFound();
        if (category.IsSystem) return BadRequest(new { error = "System categories cannot be deleted." });

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

    [Authorize]
    [HttpDelete("threads/{threadId}")]
    public async Task<IActionResult> DeleteThread(int threadId)
    {
        var result = await _forum.DeleteThreadAsync(threadId, GetUserId(), false);
        return result ? NoContent() : NotFound();
    }

    [Authorize(Roles = "Moderator,Admin")]
    [HttpDelete("threads/{threadId}/moderate")]
    public async Task<IActionResult> ModerateDeleteThread(int threadId)
    {
        var result = await _forum.DeleteThreadAsync(threadId, GetUserId(), true);
        return result ? NoContent() : NotFound();
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("threads/{threadId}/restore")]
    public async Task<IActionResult> RestoreThread(int threadId)
    {
        var result = await _forum.RestoreThreadAsync(threadId);
        return result ? Ok() : NotFound();
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("threads/{threadId}/purge")]
    public async Task<IActionResult> PurgeThread(int threadId)
    {
        var result = await _forum.PurgeThreadAsync(threadId,
            storagePath => _attachmentStore.DeleteAsync(storagePath));
        return result ? NoContent() : NotFound();
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

    // === Purge (Admin only) ===

    [Authorize(Roles = "Admin")]
    [HttpDelete("posts/{postId}/purge")]
    public async Task<IActionResult> PurgePost(long postId)
    {
        var result = await _forum.PurgePostAsync(postId,
            storagePath => _attachmentStore.DeleteAsync(storagePath));
        return result switch
        {
            PurgeResult.NotFound => NotFound(),
            PurgeResult.PostPurged => Ok(new { threadDeleted = false }),
            PurgeResult.ThreadPurged => Ok(new { threadDeleted = true }),
            _ => NotFound()
        };
    }

    // === Helpers ===

    private const int MaxImagesPerPost = 5;
    private string AttachmentPathPrefix => $"{_attachmentStore.BaseUrl}/attachments/";

    private int CountForumImages(string html)
    {
        var prefix = AttachmentPathPrefix;
        var count = 0;
        var searchFrom = 0;
        while (true)
        {
            var idx = html.IndexOf(prefix, searchFrom, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) break;
            count++;
            searchFrom = idx + prefix.Length;
        }
        return count;
    }

    private async Task LinkAttachmentsToPost(VanalyticsDbContext db, string html, long postId)
    {
        var prefix = AttachmentPathPrefix;
        var storagePaths = new List<string>();
        var searchFrom = 0;
        while (true)
        {
            var idx = html.IndexOf(prefix, searchFrom, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) break;
            var start = idx + prefix.Length;
            var end = html.IndexOfAny(new[] { '"', '\'', '>' }, start);
            if (end > start)
            {
                var fileName = html[start..end];
                storagePaths.Add($"attachments/{fileName}");
            }
            searchFrom = start;
        }

        if (storagePaths.Count > 0)
        {
            var attachments = await db.Set<ForumAttachment>()
                .Where(a => storagePaths.Contains(a.StoragePath) && a.PostId == null)
                .ToListAsync();
            foreach (var a in attachments)
                a.PostId = postId;
            await db.SaveChangesAsync();
        }
    }

    private string SanitizeImageSources(string html)
    {
        var allowedPrefix = _attachmentStore.BaseUrl;
        var result = new System.Text.StringBuilder(html.Length);
        var pos = 0;
        while (pos < html.Length)
        {
            var imgStart = html.IndexOf("<img ", pos, StringComparison.OrdinalIgnoreCase);
            if (imgStart < 0)
            {
                result.Append(html, pos, html.Length - pos);
                break;
            }
            result.Append(html, pos, imgStart - pos);

            var imgEnd = html.IndexOf('>', imgStart);
            if (imgEnd < 0)
            {
                result.Append(html, pos, html.Length - pos);
                break;
            }
            imgEnd++;

            var tag = html[imgStart..imgEnd];
            var srcIdx = tag.IndexOf("src=\"", StringComparison.OrdinalIgnoreCase);
            if (srcIdx >= 0)
            {
                var srcStart = srcIdx + 5;
                var srcEnd = tag.IndexOf('"', srcStart);
                if (srcEnd > srcStart)
                {
                    var src = tag[srcStart..srcEnd];
                    if (src.StartsWith(allowedPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        result.Append(tag);
                    }
                    // else: drop the img tag (external source)
                }
            }

            pos = imgEnd;
        }
        return result.ToString();
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Guid? GetOptionalUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return sub != null ? Guid.Parse(sub) : null;
    }
}
