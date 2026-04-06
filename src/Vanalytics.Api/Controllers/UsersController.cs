using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Soverance.Forum.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public UsersController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("{username}")]
    public async Task<IActionResult> GetUserProfile(string username)
    {
        var user = await _db.Set<User>()
            .Where(u => u.Username == username)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.DisplayName,
                u.AvatarUrl,
                u.CreatedAt,
            })
            .FirstOrDefaultAsync();

        if (user == null) return NotFound();

        var userId = user.Id;

        var postCount = await _db.Set<ForumPost>()
            .CountAsync(p => p.AuthorId == userId && !p.IsDeleted);

        var recentPosts = await _db.Set<ForumPost>()
            .Where(p => p.AuthorId == userId && !p.IsDeleted)
            .OrderByDescending(p => p.CreatedAt)
            .Take(10)
            .Select(p => new
            {
                PostId = p.Id,
                ThreadTitle = p.Thread.Title,
                CategorySlug = p.Thread.Category.Slug,
                ThreadSlug = p.Thread.Slug,
                p.CreatedAt,
                BodyPreview = p.Body.Length > 150 ? p.Body.Substring(0, 150) + "..." : p.Body,
            })
            .ToListAsync();

        var publicCharacters = await _db.Characters
            .Where(c => c.UserId == userId && c.IsPublic)
            .Select(c => new
            {
                c.Name,
                c.Server,
                ActiveJob = c.Jobs.Where(j => j.IsActive).Select(j => j.JobId).FirstOrDefault(),
                ActiveJobLevel = c.Jobs.Where(j => j.IsActive).Select(j => j.Level).FirstOrDefault(),
            })
            .ToListAsync();

        return Ok(new
        {
            user.Username,
            user.DisplayName,
            user.AvatarUrl,
            JoinedAt = user.CreatedAt,
            PostCount = postCount,
            RecentPosts = recentPosts,
            PublicCharacters = publicCharacters,
        });
    }
}
