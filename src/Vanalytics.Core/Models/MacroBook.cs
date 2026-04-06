namespace Vanalytics.Core.Models;

public class MacroBook
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
    public List<MacroPage> Pages { get; set; } = [];
    public List<MacroBookSnapshot> Snapshots { get; set; } = [];
}
