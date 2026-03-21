using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class GameServer
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ServerStatus Status { get; set; } = ServerStatus.Unknown;
    public DateTimeOffset LastCheckedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<ServerStatusChange> StatusHistory { get; set; } = [];
}
