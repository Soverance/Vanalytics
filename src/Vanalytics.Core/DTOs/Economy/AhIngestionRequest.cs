using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class AhIngestionRequest
{
    [Required]
    public int ItemId { get; set; }

    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<AhSaleEntry> Sales { get; set; } = [];
}

public class AhSaleEntry
{
    public int Price { get; set; }
    public DateTimeOffset SoldAt { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public string BuyerName { get; set; } = string.Empty;
    public int StackSize { get; set; } = 1;
}
