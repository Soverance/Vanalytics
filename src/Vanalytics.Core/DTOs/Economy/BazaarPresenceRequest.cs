using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class BazaarPresenceRequest
{
    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string Zone { get; set; } = string.Empty;

    [Required]
    public List<BazaarPlayerEntry> Players { get; set; } = [];
}

public class BazaarPlayerEntry
{
    public string Name { get; set; } = string.Empty;
}
