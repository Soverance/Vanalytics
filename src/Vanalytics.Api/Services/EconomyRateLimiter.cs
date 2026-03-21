namespace Vanalytics.Api.Services;

public class EconomyRateLimiter : RateLimiter
{
    public EconomyRateLimiter() : base(maxRequests: 120, window: TimeSpan.FromHours(1))
    {
    }
}
