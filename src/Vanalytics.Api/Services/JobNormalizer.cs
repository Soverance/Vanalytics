namespace Vanalytics.Api.Services;

// Shared job-name normalization for controllers. Mirrors the original private TryNormalizeJob on
// CharactersController so the web and addon endpoints accept/normalize jobs identically.
// Blank/whitespace returns true with normalized=null (callers that require a job must reject null).
public static class JobNormalizer
{
    public static bool TryNormalize(string? job, out string? normalized)
    {
        normalized = null;
        if (string.IsNullOrWhiteSpace(job)) return true;
        if (Enum.TryParse<Vanalytics.Core.Enums.JobType>(job.Trim(), ignoreCase: true, out var parsed))
        {
            normalized = parsed.ToString();
            return true;
        }
        return false;
    }
}
