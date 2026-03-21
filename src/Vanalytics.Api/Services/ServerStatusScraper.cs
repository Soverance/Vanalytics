using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class ServerStatusScraper : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ServerStatusScraper> _logger;
    private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(5);

    // PlayOnline serves HTTP only (no valid TLS cert)
    private const string StatusPageUrl = "http://www.playonline.com/pcd/service/ff11usindex.html";

    public ServerStatusScraper(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ServerStatusScraper> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait a bit on startup for migrations to complete
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PollServerStatusAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to poll server status");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task PollServerStatusAsync(CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("PlayOnline");
        var html = await client.GetStringAsync(StatusPageUrl, ct);

        var serverStatuses = ParseServerStatuses(html);
        if (serverStatuses.Count == 0)
        {
            _logger.LogWarning("No servers parsed from PlayOnline page");
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var now = DateTimeOffset.UtcNow;

        foreach (var (name, status) in serverStatuses)
        {
            var server = await db.GameServers
                .FirstOrDefaultAsync(s => s.Name == name, ct);

            if (server is null)
            {
                server = new GameServer
                {
                    Name = name,
                    Status = status,
                    LastCheckedAt = now,
                    CreatedAt = now,
                };
                db.GameServers.Add(server);
                await db.SaveChangesAsync(ct);

                // Open first status record
                db.ServerStatusChanges.Add(new ServerStatusChange
                {
                    GameServerId = server.Id,
                    Status = status,
                    StartedAt = now,
                });
            }
            else
            {
                server.LastCheckedAt = now;

                if (server.Status != status)
                {
                    var previousStatus = server.Status;
                    server.Status = status;

                    // Close the current status record
                    var openRecord = await db.ServerStatusChanges
                        .Where(r => r.GameServerId == server.Id && r.EndedAt == null)
                        .FirstOrDefaultAsync(ct);

                    if (openRecord is not null)
                        openRecord.EndedAt = now;

                    // Open a new status record
                    db.ServerStatusChanges.Add(new ServerStatusChange
                    {
                        GameServerId = server.Id,
                        Status = status,
                        StartedAt = now,
                    });

                    _logger.LogInformation(
                        "Server {Name} status changed: {Old} -> {New}",
                        name, previousStatus, status);
                }
            }
        }

        await db.SaveChangesAsync(ct);
        _logger.LogDebug("Server status poll complete: {Count} servers", serverStatuses.Count);
    }

    internal static List<(string Name, ServerStatus Status)> ParseServerStatuses(string html)
    {
        var results = new List<(string, ServerStatus)>();

        // PlayOnline page structure (observed):
        //   <h2>ServerName</h2>
        //   <img class="img_status" src="/ff11us/server/imgs/status_XX.gif" ...>
        //
        // or for test servers:
        //   <h2>Atomos<br>(Test Server)</h2>
        //   <img class="img_status" src="/ff11us/server/imgs/status_XX.gif" ...>
        //
        // Status image codes:
        //   status_00.gif = Online
        //   status_01.gif = Offline / Maintenance (confirmation needed, but treat non-00 as down)

        var pattern = new Regex(
            @"<h2>(?<name>[^<]+)(?:<br>[^<]*)?</h2>\s*<img[^>]+src=""[^""]*status_(?<code>\d+)\.gif""",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        foreach (Match match in pattern.Matches(html))
        {
            var name = match.Groups["name"].Value.Trim();
            var code = match.Groups["code"].Value;

            var status = code switch
            {
                "00" => ServerStatus.Online,
                "01" => ServerStatus.Maintenance,
                "02" => ServerStatus.Offline,
                _ => ServerStatus.Unknown,
            };

            results.Add((name, status));
        }

        return results;
    }
}
