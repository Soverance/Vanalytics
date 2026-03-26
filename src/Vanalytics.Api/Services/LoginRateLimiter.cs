using System.Collections.Concurrent;

namespace Vanalytics.Api.Services;

/// <summary>
/// Rate limits failed login attempts by IP address.
/// 5 failed attempts per IP within a 15-minute window triggers a lockout.
/// </summary>
public class LoginRateLimiter
{
    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _failures = new();
    private const int MaxAttempts = 5;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Returns true if the IP is currently locked out (too many recent failures).
    /// </summary>
    public bool IsLockedOut(string ipAddress)
    {
        if (!_failures.TryGetValue(ipAddress, out var timestamps))
            return false;

        var cutoff = DateTimeOffset.UtcNow - Window;

        lock (timestamps)
        {
            timestamps.RemoveAll(t => t < cutoff);
            return timestamps.Count >= MaxAttempts;
        }
    }

    /// <summary>
    /// Records a failed login attempt for the given IP.
    /// </summary>
    public void RecordFailure(string ipAddress)
    {
        var timestamps = _failures.GetOrAdd(ipAddress, _ => new List<DateTimeOffset>());

        lock (timestamps)
        {
            timestamps.Add(DateTimeOffset.UtcNow);
        }
    }

    /// <summary>
    /// Clears failure history for an IP after a successful login.
    /// </summary>
    public void ClearFailures(string ipAddress)
    {
        _failures.TryRemove(ipAddress, out _);
    }
}
