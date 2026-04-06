using System;

namespace Vanalytics.Core.Models;

public class MacroBookSnapshot
{
    public Guid Id { get; set; }
    public Guid MacroBookId { get; set; }
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public string SnapshotData { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public MacroBook MacroBook { get; set; } = null!;
}
