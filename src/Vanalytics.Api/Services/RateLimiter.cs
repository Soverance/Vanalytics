using System.Collections.Concurrent;

namespace Vanalytics.Api.Services;

public class RateLimiter
{
    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _requests = new();
    private readonly int _maxRequests;
    private readonly TimeSpan _window;

    public RateLimiter(int maxRequests = 20, TimeSpan? window = null)
    {
        _maxRequests = maxRequests;
        _window = window ?? TimeSpan.FromHours(1);
    }

    public bool IsAllowed(string key)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now - _window;

        var timestamps = _requests.GetOrAdd(key, _ => new List<DateTimeOffset>());

        lock (timestamps)
        {
            timestamps.RemoveAll(t => t < cutoff);

            if (timestamps.Count >= _maxRequests)
                return false;

            timestamps.Add(now);
            return true;
        }
    }
}
