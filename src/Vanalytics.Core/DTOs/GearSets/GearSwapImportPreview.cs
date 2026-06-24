namespace Vanalytics.Core.DTOs.GearSets;

public class ImportSlotPreview
{
    public string Slot { get; set; } = string.Empty;
    public string RawName { get; set; } = string.Empty;
    /// <summary>Resolved catalog item id; 0 when unresolved.</summary>
    public int ItemId { get; set; }
    /// <summary>Resolved catalog name, or the raw name when unresolved.</summary>
    public string ItemName { get; set; } = string.Empty;
    /// <summary>"exact" | "normalized" | "fuzzy" | "unresolved".</summary>
    public string MatchKind { get; set; } = "unresolved";
    public double? Confidence { get; set; }
    public bool Owned { get; set; }
    public List<string> Augments { get; set; } = [];
}

public class ImportSetPreview
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "Other";
    public string LuaKey { get; set; } = string.Empty;
    public bool OverwritesExisting { get; set; }
    public List<ImportSlotPreview> Slots { get; set; } = [];
}

public class GearSwapImportPreview
{
    public string? SuggestedJob { get; set; }
    public List<ImportSetPreview> Sets { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}
