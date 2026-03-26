// src/Vanalytics.Core/DTOs/Macros/MacroBookResponse.cs
namespace Vanalytics.Core.DTOs.Macros;

public class MacroBookSummary
{
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public bool IsEmpty { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public class MacroBookDetail
{
    public int BookNumber { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public bool PendingPush { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<MacroPageDetail> Pages { get; set; } = [];
}

public class MacroPageDetail
{
    public int PageNumber { get; set; }
    public List<MacroDetail> Macros { get; set; } = [];
}

public class MacroDetail
{
    public string Set { get; set; } = string.Empty;
    public int Position { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Icon { get; set; }
    public string Line1 { get; set; } = string.Empty;
    public string Line2 { get; set; } = string.Empty;
    public string Line3 { get; set; } = string.Empty;
    public string Line4 { get; set; } = string.Empty;
    public string Line5 { get; set; } = string.Empty;
    public string Line6 { get; set; } = string.Empty;
}
