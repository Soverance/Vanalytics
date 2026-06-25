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
        ["sa"] = "SA", ["ta"] = "TA", ["sata"] = "SATA",
        ["acc"] = "Acc", ["pdt"] = "PDT", ["mdt"] = "MDT", ["macc"] = "MAcc",
        ["dt"] = "DT", ["sb"] = "SB", ["mb"] = "MB",
    };

    // Top-level namespaces whose sub-keys are cycle VARIANTS (rendered "Base (Variant)"),
    // as opposed to action namespaces whose sub-keys name a specific action ("Qualifier: Action").
    private static readonly HashSet<string> ModeNamespaces = new(StringComparer.OrdinalIgnoreCase)
    {
        "idle", "engaged", "tp", "resting", "melee", "defense", "weapons",
    };

    // Uppercase first char, preserve the rest (handles camelCase like "myCustomThing" → "MyCustomThing").
    private static string Token(string t) =>
        Pretty.TryGetValue(t, out var p)
            ? p
            : t.Length == 0 ? t : char.ToUpperInvariant(t[0]) + t[1..];

    public static string FriendlyName(IReadOnlyList<SetKeySegment> segs)
    {
        if (segs.Count == 0) return "Set";
        if (segs.Count == 1) return Token(segs[0].Text);

        // The delimiter conveys meaning, independent of Lua bracket-vs-dotted syntax:
        // mode namespaces read "Base (Variant)"; action namespaces read "Qualifier: Action".
        if (ModeNamespaces.Contains(segs[0].Text))
        {
            var head = Token(segs[0].Text);
            var variant = string.Join(" ", segs.Skip(1).Select(s => Token(s.Text)));
            return $"{head} ({variant})";
        }

        // Action set: the last segment is the action name; the one before it is the qualifier
        // (e.g. [WS, SA, "Rudra's Storm"] -> "SA: Rudra's Storm"; [JA, Steal] -> "JA: Steal").
        var leaf = Token(segs[^1].Text);
        var qualifier = Token(segs[^2].Text);
        return $"{qualifier}: {leaf}";
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
            "tp" => "Engaged",       // TP/melee cycle sets are engaged sets
            "resting" => "Idle",
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
