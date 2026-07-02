using Vanalytics.Core.Services.Economy;
using Xunit;

namespace Vanalytics.Api.Tests.Economy;

public class PriceBucketsTests
{
    [Theory]
    [InlineData(30, "day")]
    [InlineData(90, "day")]
    [InlineData(91, "week")]
    [InlineData(365, "week")]
    [InlineData(0, "month")]     // all-time
    [InlineData(-5, "month")]    // all-time (defensive)
    [InlineData(800, "month")]   // beyond a year
    public void BucketForDays_DerivesGranularity(int days, string expected)
        => Assert.Equal(expected, PriceBuckets.BucketForDays(days));

    [Fact]
    public void BucketStart_Day_TruncatesToMidnightUtc()
    {
        var dt = new DateTimeOffset(2026, 6, 15, 13, 45, 0, TimeSpan.Zero);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 0, 0, 0, TimeSpan.Zero), PriceBuckets.BucketStart(dt, "day"));
    }

    [Fact]
    public void BucketStart_Week_SnapsToMondayUtc()
    {
        // 2026-06-17 is a Wednesday → Monday is 2026-06-15
        var dt = new DateTimeOffset(2026, 6, 17, 9, 0, 0, TimeSpan.Zero);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 0, 0, 0, TimeSpan.Zero), PriceBuckets.BucketStart(dt, "week"));
    }

    [Fact]
    public void BucketStart_Week_Sunday_SnapsToPreviousMonday()
    {
        // 2026-06-21 is a Sunday → Monday is 2026-06-15
        var dt = new DateTimeOffset(2026, 6, 21, 23, 0, 0, TimeSpan.Zero);
        Assert.Equal(new DateTimeOffset(2026, 6, 15, 0, 0, 0, TimeSpan.Zero), PriceBuckets.BucketStart(dt, "week"));
    }

    [Fact]
    public void BucketStart_Month_SnapsToFirstUtc()
    {
        var dt = new DateTimeOffset(2026, 6, 27, 5, 0, 0, TimeSpan.Zero);
        Assert.Equal(new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero), PriceBuckets.BucketStart(dt, "month"));
    }

    [Fact]
    public void BucketStart_NormalizesNonUtcOffsetFirst()
    {
        // 2026-06-15 01:00 +02:00 == 2026-06-14 23:00 UTC → day bucket 2026-06-14
        var dt = new DateTimeOffset(2026, 6, 15, 1, 0, 0, TimeSpan.FromHours(2));
        Assert.Equal(new DateTimeOffset(2026, 6, 14, 0, 0, 0, TimeSpan.Zero), PriceBuckets.BucketStart(dt, "day"));
    }
}
