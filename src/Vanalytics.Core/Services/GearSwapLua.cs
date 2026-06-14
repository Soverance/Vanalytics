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
}
