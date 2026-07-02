namespace Vanalytics.Core.Services.SearchServer;

public readonly record struct AhSale(
    int Price, DateTimeOffset SoldAt, string SellerName, string BuyerName, bool Stack);

/// <summary>
/// A decoded AH-history response: the recent sales plus the count currently listed on the AH
/// (singles for a single request, stacks for a stack request — read from offset 0x1A).
/// </summary>
public readonly record struct AhHistoryResult(int OnAhQuantity, IReadOnlyList<AhSale> Sales);
