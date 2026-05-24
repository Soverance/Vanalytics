namespace Vanalytics.Core.DTOs.Porter;

public class PorterSlipResponse
{
    public int SlipItemId { get; set; }
    public int SlipNumber { get; set; }
    public string SlipName { get; set; } = string.Empty;
    public string? SlipIconPath { get; set; }
    public DateTimeOffset SyncedAt { get; set; }
    public bool UserHidden { get; set; }
    public List<PorterItemResponse> Items { get; set; } = [];
}

public class PorterItemResponse
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? IconPath { get; set; }
    public string? Category { get; set; }
    public int? BaseSell { get; set; }
    public int StackSize { get; set; }
    public bool IsRare { get; set; }
    public bool IsExclusive { get; set; }
}
