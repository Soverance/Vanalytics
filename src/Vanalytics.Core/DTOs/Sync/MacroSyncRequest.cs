// src/Vanalytics.Core/DTOs/Sync/MacroSyncRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class MacroSyncRequest
{
    [Required]
    public List<MacroSyncBook> Books { get; set; } = [];
}

public class MacroSyncBook
{
    [Range(1, 20)]
    public int BookNumber { get; set; }

    [Required, MaxLength(64)]
    public string ContentHash { get; set; } = string.Empty;

    [MaxLength(16)]
    public string BookTitle { get; set; } = string.Empty;

    [Required]
    public List<MacroSyncPage> Pages { get; set; } = [];
}

public class MacroSyncPage
{
    [Range(1, 10)]
    public int PageNumber { get; set; }

    [Required]
    public List<MacroSyncEntry> Macros { get; set; } = [];
}

public class MacroSyncEntry
{
    [Required, RegularExpression("^(Ctrl|Alt)$")]
    public string Set { get; set; } = string.Empty;

    [Range(1, 10)]
    public int Position { get; set; }

    [MaxLength(8)]
    public string Name { get; set; } = string.Empty;

    [Range(0, 255)]
    public int Icon { get; set; }

    [MaxLength(61)]
    public string Line1 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line2 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line3 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line4 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line5 { get; set; } = string.Empty;
    [MaxLength(61)]
    public string Line6 { get; set; } = string.Empty;
}
