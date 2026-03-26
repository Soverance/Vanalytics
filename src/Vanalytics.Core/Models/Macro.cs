namespace Vanalytics.Core.Models;

public class Macro
{
    public Guid Id { get; set; }
    public Guid MacroPageId { get; set; }
    public string Set { get; set; } = string.Empty; // "Ctrl" or "Alt"
    public int Position { get; set; } // 1-10
    public string Name { get; set; } = string.Empty;
    public int Icon { get; set; }
    public string Line1 { get; set; } = string.Empty;
    public string Line2 { get; set; } = string.Empty;
    public string Line3 { get; set; } = string.Empty;
    public string Line4 { get; set; } = string.Empty;
    public string Line5 { get; set; } = string.Empty;
    public string Line6 { get; set; } = string.Empty;

    public MacroPage Page { get; set; } = null!;
}
