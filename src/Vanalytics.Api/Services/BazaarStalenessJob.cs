using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class BazaarStalenessJob : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BazaarStalenessJob> _logger;
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan StalenessThreshold = TimeSpan.FromMinutes(30);

    public BazaarStalenessJob(IServiceScopeFactory scopeFactory, ILogger<BazaarStalenessJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ExpireStalePresencesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Bazaar staleness check failed");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }

    private async Task ExpireStalePresencesAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var cutoff = DateTimeOffset.UtcNow - StalenessThreshold;

        var expired = await db.BazaarPresences
            .Where(p => p.IsActive && p.LastSeenAt < cutoff)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsActive, false), ct);

        if (expired > 0)
            _logger.LogInformation("Expired {Count} stale bazaar presences", expired);

        // Also expire listings whose seller is no longer active
        var expiredListings = await db.BazaarListings
            .Where(l => l.IsActive && l.LastSeenAt < cutoff)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsActive, false), ct);

        if (expiredListings > 0)
            _logger.LogInformation("Expired {Count} stale bazaar listings", expiredListings);
    }
}
