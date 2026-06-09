using Microsoft.EntityFrameworkCore;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Soverance.Forum.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

/// <summary>
/// Runs EF Core migrations and seed data in the background so the HTTP server
/// can start immediately and respond to health probes while the database is
/// still waking up or migrations are running.
/// </summary>
public class DatabaseMigrationService(IServiceProvider services, IConfiguration configuration, ILogger<DatabaseMigrationService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

            logger.LogInformation("Running database migrations...");
            await db.Database.MigrateAsync(stoppingToken);
            logger.LogInformation("Database migrations completed.");

            var adminEmail = configuration["ADMIN_EMAIL"];
            var adminUsername = configuration["ADMIN_USERNAME"];
            var adminPassword = configuration["ADMIN_PASSWORD"];

            if (!string.IsNullOrEmpty(adminEmail) &&
                !string.IsNullOrEmpty(adminUsername) &&
                !string.IsNullOrEmpty(adminPassword))
            {
                await AdminSeeder.SeedAsync(db, adminEmail, adminUsername, adminPassword, logger);
            }

            await ForumSeeder.SeedSystemCategoriesAsync(db);

            // One-time, idempotent de-emailing of legacy OAuth usernames.
            await UsernameBackfill.BackfillAsync(db, new UsernameGenerator(), logger, stoppingToken);

            logger.LogInformation("Database seeding completed.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Database migration failed. The application may be in a degraded state.");
        }
    }
}
