namespace Vanalytics.Core.Services.GearSwapImport;

/// <summary>One segment of a sets key path. IsBracket=true means it came from
/// ['a string'] (a named entry); false means a .identifier qualifier.</summary>
public record SetKeySegment(string Text, bool IsBracket);

public static class SetNaming
{
    // Known tokens rendered with canonical casing; everything else is title-cased.
    private static readonly Dictionary<string, string> Pretty = new(StringComparer.OrdinalIgnoreCase)
    {
        ["idle"] = "Idle", ["engaged"] = "Engaged", ["precast"] = "Precast",
        ["midcast"] = "Midcast", ["aftercast"] = "Aftercast", ["weapons"] = "Weapons",
        ["ws"] = "WS", ["ja"] = "JA", ["tp"] = "TP", ["fc"] = "FC",
        ["acc"] = "Acc", ["pdt"] = "PDT", ["mdt"] = "MDT", ["macc"] = "MAcc",
        ["dt"] = "DT", ["sb"] = "SB", ["mb"] = "MB",
    };

    // Uppercase first char, preserve the rest (handles camelCase like "myCustomThing" → "MyCustomThing").
    private static string Token(string t) =>
        Pretty.TryGetValue(t, out var p)
            ? p
            : t.Length == 0 ? t : char.ToUpperInvariant(t[0]) + t[1..];

    public static string FriendlyName(IReadOnlyList<SetKeySegment> segs)
    {
        if (segs.Count == 0) return "Set";

        var bracket = segs.LastOrDefault(s => s.IsBracket);
        if (bracket is not null)
        {
            // Nearest identifier qualifier before the bracket name (e.g. WS, midcast).
            var qualifiers = segs.Where(s => !s.IsBracket).ToList();
            var prefix = qualifiers.Count > 0 ? Token(qualifiers[^1].Text) : null;
            return prefix is null ? bracket.Text : $"{prefix}: {bracket.Text}";
        }

        // All identifiers: first is the base, the rest become a parenthetical.
        var head = Token(segs[0].Text);
        if (segs.Count == 1) return head;
        var tail = string.Join(" ", segs.Skip(1).Select(s => Token(s.Text)));
        return $"{head} ({tail})";
    }

    public static string Category(IReadOnlyList<SetKeySegment> segs)
    {
        if (segs.Count == 0) return "Other";
        var first = segs[0].Text.ToLowerInvariant();
        var second = segs.Count > 1 ? segs[1].Text.ToLowerInvariant() : null;

        return first switch
        {
            "idle" => "Idle",
            "engaged" => "Engaged",
            "aftercast" => "Aftercast",
            "midcast" => "Midcast",
            "weapons" => "Weapons",
            "precast" => second switch { "ws" => "WeaponSkill", "ja" => "JobAbility", _ => "Precast" },
            "ws" => "WeaponSkill",
            "ja" => "JobAbility",
            _ => "Other",
        };
    }
}
