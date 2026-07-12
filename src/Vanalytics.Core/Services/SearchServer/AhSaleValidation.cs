namespace Vanalytics.Core.Services.SearchServer;

/// <summary>
/// Plausibility checks for decoded AH sales. Defense-in-depth against stale/garbage entries:
/// the decoder now bounds by the declared entry count (fixing the padded-slot over-read), but
/// this guard ensures a future protocol surprise can never poison AuctionSales again.
/// </summary>
public static class AhSaleValidation
{
    /// FFXI JP launch (2002-05-16). No real Auction House sale can predate this.
    public static readonly DateTimeOffset FfxiEpoch = new(2002, 5, 16, 0, 0, 0, TimeSpan.Zero);

    /// AH single/stack price ceiling (9 digits).
    public const int MaxPrice = 999_999_999;

    /// <summary>
    /// High-confidence, zero-false-positive check used at INGESTION: price and timestamp only.
    /// A real sale always satisfies this; stale server memory (e.g. a 1976 date or a &gt;1B price)
    /// does not. Names are deliberately NOT checked here to avoid ever dropping a legitimate sale;
    /// name validity is only used by the one-time purge of already-poisoned rows.
    /// </summary>
    public static bool IsPlausible(int price, DateTimeOffset soldAt, DateTimeOffset now)
        => price > 0
           && price <= MaxPrice
           && soldAt >= FfxiEpoch
           && soldAt <= now.AddDays(1);
}
