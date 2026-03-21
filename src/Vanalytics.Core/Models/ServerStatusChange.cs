using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class ServerStatusChange
{
    public long Id { get; set; }
    public int GameServerId { get; set; }
    public ServerStatus Status { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    public GameServer GameServer { get; set; } = null!;
}
