namespace Vanalytics.Core.Services.Economy;

public static class PriceMath
{
    /// <summary>
    /// Median of a set of prices. Input need not be sorted. Even count → average of the
    /// two middle values (integer, floored). Empty → 0.
    /// </summary>
    public static int Median(IReadOnlyList<int> prices)
    {
        if (prices.Count == 0) return 0;
        var sorted = prices.OrderBy(p => p).ToArray();
        int mid = sorted.Length / 2;
        return sorted.Length % 2 == 1
            ? sorted[mid]
            : (int)(((long)sorted[mid - 1] + sorted[mid]) / 2);
    }
}
