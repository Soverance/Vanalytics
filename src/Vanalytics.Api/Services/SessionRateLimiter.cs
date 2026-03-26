namespace Vanalytics.Api.Services;

public class SessionRateLimiter : RateLimiter
{
    public SessionRateLimiter() : base(maxRequests: 300, window: TimeSpan.FromHours(1))
    {
    }
}
