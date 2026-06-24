using System.Text;

namespace Vanalytics.Core.Services.GearSwapImport;

public record ItemMatch(int ItemId, string CanonicalName, string MatchKind, double? Confidence);

/// <summary>Resolves a raw GearSwap item-name string to a catalog item. Tries exact,
/// then normalized (case/punctuation/whitespace-insensitive), then fuzzy (Levenshtein
/// ratio over normalized text). Pure: the caller supplies the candidate catalog.</summary>
public sealed class ItemNameResolver
{
    private const double FuzzyThreshold = 0.85;

    private readonly Dictionary<string, (int Id, string Name)> _exact = new(StringComparer.Ordinal);
    private readonly Dictionary<string, (int Id, string Name)> _normalized = new(StringComparer.Ordinal);
    private readonly List<(string Norm, int Id, string Name)> _all = new();

    public ItemNameResolver(IEnumerable<(int ItemId, string Name)> catalog)
    {
        foreach (var (id, name) in catalog)
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            _exact[name] = (id, name);
            var norm = Normalize(name);
            _normalized.TryAdd(norm, (id, name));
            _all.Add((norm, id, name));
        }
    }

    public ItemMatch Resolve(string rawName)
    {
        var raw = rawName.Trim();
        if (_exact.TryGetValue(raw, out var e))
            return new ItemMatch(e.Id, e.Name, "exact", null);

        var norm = Normalize(raw);
        if (_normalized.TryGetValue(norm, out var n))
            return new ItemMatch(n.Id, n.Name, "normalized", null);

        (string Name, int Id, double Score) best = ("", 0, 0);
        foreach (var (candNorm, id, name) in _all)
        {
            var score = Ratio(norm, candNorm);
            if (score > best.Score) best = (name, id, score);
        }
        return best.Score >= FuzzyThreshold
            ? new ItemMatch(best.Id, best.Name, "fuzzy", Math.Round(best.Score, 3))
            : new ItemMatch(0, rawName, "unresolved", null);
    }

    // lowercase, drop everything except [a-z0-9+], so "Plun. Culottes +1" ~ "pluncculottes+1".
    internal static string Normalize(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s.ToLowerInvariant())
            if (ch is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '+')
                sb.Append(ch);
        return sb.ToString();
    }

    // Levenshtein similarity ratio in [0,1].
    private static double Ratio(string a, string b)
    {
        if (a.Length == 0 && b.Length == 0) return 1;
        var dist = Levenshtein(a, b);
        var max = Math.Max(a.Length, b.Length);
        return max == 0 ? 1 : 1.0 - (double)dist / max;
    }

    private static int Levenshtein(string a, string b)
    {
        var prev = new int[b.Length + 1];
        var cur = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) prev[j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            cur[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                cur[j] = Math.Min(Math.Min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            (prev, cur) = (cur, prev);
        }
        return prev[b.Length];
    }
}
