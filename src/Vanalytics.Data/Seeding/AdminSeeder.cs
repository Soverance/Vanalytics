using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Seeding;

public static class AdminSeeder
{
    public static async Task SeedAsync(
        VanalyticsDbContext db,
        string email,
        string username,
        string passwordHash,
        ILogger logger)
    {
        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing is not null)
        {
            var changed = false;
            if (existing.Role != UserRole.Admin) { existing.Role = UserRole.Admin; changed = true; }
            if (!existing.IsSystemAccount) { existing.IsSystemAccount = true; changed = true; }
            if (changed)
            {
                existing.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync();
                logger.LogInformation("System admin account updated: {Username}", existing.Username);
            }
            return;
        }

        var admin = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = passwordHash,
            Role = UserRole.Admin,
            IsSystemAccount = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Users.Add(admin);
        await db.SaveChangesAsync();
        logger.LogInformation("Admin user seeded: {Username}", username);
    }
}
