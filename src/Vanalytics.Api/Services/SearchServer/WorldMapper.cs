namespace Vanalytics.Api.Services.SearchServer;

public static class WorldMapper
{
    public static (string? Server, int Confidence) Map(
        IReadOnlyCollection<string> onlineNames,
        IReadOnlyDictionary<string, IReadOnlyCollection<string>> charactersByServer,
        int threshold)
    {
        var online = new HashSet<string>(onlineNames, StringComparer.OrdinalIgnoreCase);
        string? best = null;
        int bestOverlap = 0;
        foreach (var (server, names) in charactersByServer)
        {
            int overlap = names.Count(online.Contains);
            if (overlap > bestOverlap) { bestOverlap = overlap; best = server; }
        }
        return bestOverlap >= threshold ? (best, bestOverlap) : (null, bestOverlap);
    }
}
