using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Soverance.Messaging.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class VanalyticsMessagingUserResolver : IMessagingUserResolver
{
    private readonly VanalyticsDbContext _db;

    public VanalyticsMessagingUserResolver(VanalyticsDbContext db)
    {
        _db = db;
    }

    public async Task<Dictionary<Guid, MessagingUserInfo>> ResolveUsersAsync(IEnumerable<Guid> userIds)
    {
        var ids = userIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        var users = await _db.Set<User>()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.Username, u.DisplayName, u.AvatarUrl })
            .ToListAsync();

        return users.ToDictionary(
            u => u.Id,
            u => new MessagingUserInfo(u.Id, u.Username, u.DisplayName, u.AvatarUrl));
    }
}
