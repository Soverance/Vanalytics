using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Soverance.Forum.Models;
using Soverance.Forum.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class VanalyticsForumAuthorResolver : IForumAuthorResolver
{
    private readonly VanalyticsDbContext _db;

    public VanalyticsForumAuthorResolver(VanalyticsDbContext db)
    {
        _db = db;
    }

    public async Task<Dictionary<Guid, ForumAuthorInfo>> ResolveAuthorsAsync(IEnumerable<Guid> authorIds)
    {
        var ids = authorIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        var users = await _db.Set<User>()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.Username, u.Email, u.CreatedAt })
            .ToListAsync();

        var postCounts = await _db.Set<ForumPost>()
            .Where(p => ids.Contains(p.AuthorId) && !p.IsDeleted)
            .GroupBy(p => p.AuthorId)
            .Select(g => new { AuthorId = g.Key, Count = g.Count() })
            .ToListAsync();

        var countMap = postCounts.ToDictionary(x => x.AuthorId, x => x.Count);

        return users.ToDictionary(
            u => u.Id,
            u => new ForumAuthorInfo(
                u.Id,
                u.Username,
                u.Email,
                countMap.GetValueOrDefault(u.Id),
                u.CreatedAt));
    }
}
