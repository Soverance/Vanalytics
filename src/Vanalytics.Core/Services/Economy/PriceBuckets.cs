namespace Vanalytics.Core.Services.Economy;

/// <summary>
/// Time-bucketing for the price-history trend chart. Granularity is derived from the
/// requested span so any range — including all-time — renders as a readable median line.
/// </summary>
public static class PriceBuckets
{
    /// <summary>day (0,90] · week (90,365] · month (all-time / >365).</summary>
    public static string BucketForDays(int days)
    {
        if (days <= 0 || days > 365) return "month";
        if (days <= 90) return "day";
        return "week";
    }

    /// <summary>UTC-truncated start of the bucket containing <paramref name="instant"/>.</summary>
    public static DateTimeOffset BucketStart(DateTimeOffset instant, string bucket)
    {
        var u = instant.ToUniversalTime();
        var day = new DateTimeOffset(u.Year, u.Month, u.Day, 0, 0, 0, TimeSpan.Zero);
        return bucket switch
        {
            "month" => new DateTimeOffset(u.Year, u.Month, 1, 0, 0, 0, TimeSpan.Zero),
            // Monday-start ISO week: Sunday(0) → back 6, else back (DayOfWeek-1).
            "week" => day.AddDays(-(day.DayOfWeek == DayOfWeek.Sunday ? 6 : (int)day.DayOfWeek - 1)),
            _ => day,
        };
    }
}
