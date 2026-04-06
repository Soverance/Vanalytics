using System;

namespace Vanalytics.Core.DTOs.Macros;

public class MacroBookSnapshotSummary
{
    public Guid Id { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
