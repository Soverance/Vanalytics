using Soverance.Auth.Models;

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
    public Guid ReportedByUserId { get; set; }
    public DateTimeOffset ReportedAt { get; set; }

    public GameItem Item { get; set; } = null!;
    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
