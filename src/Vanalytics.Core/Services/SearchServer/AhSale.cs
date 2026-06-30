namespace Vanalytics.Core.Services.SearchServer;

public readonly record struct AhSale(
    int Price, DateTimeOffset SoldAt, string SellerName, string BuyerName, bool Stack);
