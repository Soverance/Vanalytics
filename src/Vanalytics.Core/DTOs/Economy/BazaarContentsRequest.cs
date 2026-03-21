using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class BazaarContentsRequest
{
    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string SellerName { get; set; } = string.Empty;

    [Required]
    public string Zone { get; set; } = string.Empty;

    [Required]
    public List<BazaarItemEntry> Items { get; set; } = [];
}

public class BazaarItemEntry
{
    public int ItemId { get; set; }
    public int Price { get; set; }
    public int Quantity { get; set; } = 1;
}
