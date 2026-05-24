using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class PorterSyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<PorterSlipEntry> Slips { get; set; } = [];
}

public class PorterSlipEntry
{
    [Required]
    public int SlipItemId { get; set; }

    [Required]
    public int SlipNumber { get; set; }

    [Required]
    public List<int> ItemIds { get; set; } = [];
}
