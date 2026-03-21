using Soverance.Auth.Models;

namespace Vanalytics.Core.Models;

public class BazaarListing
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public int ServerId { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public int Price { get; set; }
    public int Quantity { get; set; }
    public string Zone { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public Guid ReportedByUserId { get; set; }

    public GameItem Item { get; set; } = null!;
    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
