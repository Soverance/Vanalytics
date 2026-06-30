namespace Vanalytics.Core.Models;

public class AuctionSale
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public int ServerId { get; set; }
    public int Price { get; set; }
    public DateTimeOffset SoldAt { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public string BuyerName { get; set; } = string.Empty;
    public int StackSize { get; set; } = 1;
    /// <summary>When the scraper recorded this row.</summary>
    public DateTimeOffset ObservedAt { get; set; }

    public GameItem Item { get; set; } = null!;
    public GameServer Server { get; set; } = null!;
}
