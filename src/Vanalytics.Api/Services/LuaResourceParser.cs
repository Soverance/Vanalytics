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
                Damage = GetIntOrNull(fields, "damage"),
                Delay = GetIntOrNull(fields, "delay"),
            };
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
        var fieldPattern = new Regex(@"(\w+)\s*=\s*(?:""([^""]*)""|(\-?\d+))", RegexOptions.Compiled);
        foreach (Match m in fieldPattern.Matches(fieldStr))
        {
            var key = m.Groups[1].Value;
            var value = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value;
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
}
