// src/Vanalytics.Core/Services/GearSwapLua.cs
using System.Text.RegularExpressions;

namespace Vanalytics.Core.Services;

/// <summary>
/// Lua string-escaping helpers for GearSwap output. Ported verbatim from the web's
/// gearSwapExport.ts so the two emitters agree: double-quoted item names (escape backslash
/// then double-quote), single-quoted augments/keys (escape backslash then apostrophe),
/// newlines collapsed to spaces.
/// </summary>
public static class GearSwapLua
{
    private static string Collapse(string s) => Regex.Replace(s, "\r\n|[\r\n]", " ");

    public static string Name(string name) =>
        "\"" + Collapse(name).Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";

    public static string Augment(string aug) =>
        "'" + Collapse(aug).Replace("\\", "\\\\").Replace("'", "\\'") + "'";

    public static string Key(string name) =>
        "'" + Collapse(name).Replace("\\", "\\\\").Replace("'", "\\'") + "'";

    /// <summary>
    /// Sanitizes an arbitrary name into a valid Lua identifier for a Mode namespace
    /// (e.g. "Ranged TP" -> "RangedTP", "2H Weapons" -> "_2HWeapons"). Strips any char outside
    /// [A-Za-z0-9_], prefixes "_" if it would start with a digit, and falls back to "Mode" if nothing
    /// is left. The mode's macro *command string* is NOT sanitized — it may keep spaces.
    /// </summary>
    public static string Ident(string name)
    {
        var cleaned = Regex.Replace(name ?? "", "[^A-Za-z0-9_]", "");
        if (cleaned.Length == 0) return "Mode";
        if (char.IsDigit(cleaned[0])) cleaned = "_" + cleaned;
        return cleaned;
    }
}
