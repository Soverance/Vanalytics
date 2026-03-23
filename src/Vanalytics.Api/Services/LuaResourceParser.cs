using System.Text.RegularExpressions;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

public static class LuaResourceParser
{
    public static List<GameItem> ParseItems(string lua)
    {
        var items = new List<GameItem>();
        var entryPattern = new Regex(@"\[(\d+)\]\s*=\s*\{([^}]+)\}", RegexOptions.Compiled);

        foreach (Match match in entryPattern.Matches(lua))
        {
            var fields = ParseFields(match.Groups[2].Value);
            var item = new GameItem
            {
                ItemId = int.Parse(match.Groups[1].Value),
                Name = GetString(fields, "en"),
                NameJa = GetStringOrNull(fields, "ja"),
                NameLong = GetStringOrNull(fields, "enl"),
                Category = GetString(fields, "category", "Unknown"),
                Flags = GetInt(fields, "flags"),
                StackSize = GetInt(fields, "stack", 1),
                Type = GetInt(fields, "type"),
                Level = GetIntOrNull(fields, "level"),
                Jobs = GetIntOrNull(fields, "jobs"),
                Races = GetIntOrNull(fields, "races"),
                Slots = GetIntOrNull(fields, "slots"),
                Skill = GetIntOrNull(fields, "skill"),
                ItemLevel = GetIntOrNull(fields, "item_level"),
                Damage = GetIntOrNull(fields, "damage"),
                Delay = GetIntOrNull(fields, "delay"),
            };
            item.SubCategory = DeriveSubCategory(item);
            items.Add(item);
        }
        return items;
    }

    public static Dictionary<int, (string En, string? Ja)> ParseDescriptions(string lua)
    {
        var descriptions = new Dictionary<int, (string En, string? Ja)>();
        var entryPattern = new Regex(@"\[(\d+)\]\s*=\s*\{([^}]+)\}", RegexOptions.Compiled);

        foreach (Match match in entryPattern.Matches(lua))
        {
            var id = int.Parse(match.Groups[1].Value);
            var fields = ParseFields(match.Groups[2].Value);
            var en = GetStringOrNull(fields, "en");
            if (en != null)
            {
                en = en.Replace("\\n", "\n");
                var ja = GetStringOrNull(fields, "ja")?.Replace("\\n", "\n");
                descriptions[id] = (en, ja);
            }
        }
        return descriptions;
    }

    private static Dictionary<string, string> ParseFields(string fieldStr)
    {
        var fields = new Dictionary<string, string>();
        // Match strings with escaped quotes: "value with \"escaped\" quotes"
        // Or plain integers: 12345
        var fieldPattern = new Regex(@"(\w+)\s*=\s*(?:""((?:[^""\\]|\\.)*)""|\s*(\-?\d+))", RegexOptions.Compiled);
        foreach (Match m in fieldPattern.Matches(fieldStr))
        {
            var key = m.Groups[1].Value;
            var value = m.Groups[2].Success
                ? m.Groups[2].Value.Replace("\\\"", "\"")  // Unescape Lua escaped quotes
                : m.Groups[3].Value;
            fields[key] = value;
        }
        return fields;
    }

    private static string GetString(Dictionary<string, string> fields, string key, string defaultValue = "")
        => fields.TryGetValue(key, out var v) ? v : defaultValue;

    private static string? GetStringOrNull(Dictionary<string, string> fields, string key)
        => fields.TryGetValue(key, out var v) ? v : null;

    private static int GetInt(Dictionary<string, string> fields, string key, int defaultValue = 0)
        => fields.TryGetValue(key, out var v) && int.TryParse(v, out var i) ? i : defaultValue;

    private static int? GetIntOrNull(Dictionary<string, string> fields, string key)
        => fields.TryGetValue(key, out var v) && int.TryParse(v, out var i) ? i : null;

    /// <summary>
    /// Derive a player-friendly subcategory from item fields.
    /// Uses item ID ranges, category, type, skill, slots, and enl (long name)
    /// to match the FFXIAH-style browse categories familiar to FFXI players.
    /// </summary>
    private static string DeriveSubCategory(GameItem item)
    {
        var id = item.ItemId;
        var enl = item.NameLong?.ToLowerInvariant() ?? "";

        return item.Category switch
        {
            "Weapon" => item.Skill switch
            {
                1 => "Hand-to-Hand",
                2 => "Daggers",
                3 => "Swords",
                4 => "Great Swords",
                5 => "Axes",
                6 => "Great Axes",
                7 => "Scythes",
                8 => "Polearms",
                9 => "Katana",
                10 => "Great Katana",
                11 => "Clubs",
                12 => "Staves",
                25 => "Archery",
                26 => "Marksmanship",
                _ => "Other Weapons"
            },
            "Armor" => DeriveArmorSubCategory(item),
            "Usable" => DeriveUsableSubCategory(id, enl, item.Type),
            "General" => DeriveGeneralSubCategory(id, item.Type),
            "Automaton" => "Automaton",
            "Maze" => "Maze",
            "Gil" => "Currency",
            _ => "Other"
        };
    }

    private static string DeriveArmorSubCategory(GameItem item)
    {
        if (item.Slots is null) return "Other Armor";
        var slots = item.Slots.Value;
        // Check slots bitmask — order matters (Sub for shields before others)
        if ((slots & 0x0002) != 0 && item.Skill is null) return "Shields"; // Sub slot, no weapon skill = shield
        if ((slots & 0x0010) != 0) return "Head";
        if ((slots & 0x0020) != 0) return "Body";
        if ((slots & 0x0040) != 0) return "Hands";
        if ((slots & 0x0080) != 0) return "Legs";
        if ((slots & 0x0100) != 0) return "Feet";
        if ((slots & 0x0200) != 0) return "Neck";
        if ((slots & 0x0400) != 0) return "Waist";
        if ((slots & 0x1800) != 0) return "Earrings";  // EarL | EarR
        if ((slots & 0x6000) != 0) return "Rings";     // RingL | RingR
        if ((slots & 0x8000) != 0) return "Back";
        return "Other Armor";
    }

    private static string DeriveUsableSubCategory(int id, string enl, int type)
    {
        // Crystals and clusters
        if (type == 8) return "Crystals";
        if (id >= 4104 && id <= 4111) return "Crystals"; // clusters

        // Scrolls: magic scrolls have "scroll of" in their long name
        if (enl.StartsWith("scroll of ")) return "Scrolls";

        // Medicines: potions, ethers, remedies, antidotes, etc. (ID range 4112-4239)
        if (id >= 4112 && id <= 4239) return "Medicines";

        // Fish (usable fish items, ID range 4301-4349)
        if (id >= 4304 && id <= 4349) return "Fish";

        // Food & Ingredients (ID range 4350-4605)
        if (id >= 4350 && id <= 4605) return "Food";

        // Ninja tools (ID range 5900-6143)
        if (id >= 5860 && id <= 6143) return "Ninja Tools";

        // Linkshells and misc usable
        if (id >= 4240 && id <= 4303) return "Misc";

        // Everything else in Usable that doesn't fit above
        return "Misc";
    }

    private static string DeriveGeneralSubCategory(int id, int type)
    {
        // Furnishings
        if (type == 10) return "Furnishings";

        // Materials / Crafting ingredients (vast majority of General items)
        // These are ores, logs, hides, cloths, bones, etc.
        return "Materials";
    }
}
