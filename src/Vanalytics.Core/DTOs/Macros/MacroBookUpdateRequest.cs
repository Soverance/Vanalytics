// src/Vanalytics.Core/DTOs/Macros/MacroBookUpdateRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Macros;

public class MacroBookUpdateRequest
{
    [Required]
    public List<MacroPageUpdate> Pages { get; set; } = [];
}

public class MacroPageUpdate
{
    [Range(1, 10)]
    public int PageNumber { get; set; }

    [Required]
    public List<MacroUpdate> Macros { get; set; } = [];
}

public class MacroUpdate
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
