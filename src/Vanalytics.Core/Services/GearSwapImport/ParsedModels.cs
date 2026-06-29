namespace Vanalytics.Core.Services.GearSwapImport;

/// <summary>One occupied slot extracted from a GearSwap set table.
/// Slot is the internal grid name (Main, Head, Ear1...). ItemName is the raw,
/// un-escaped Lua string (not yet resolved against the item catalog).</summary>
public record ParsedSlot(string Slot, string ItemName, IReadOnlyList<string> Augments);

/// <summary>One gear set reconstructed from the file.
/// LuaKey is the original dotted/bracket key path (e.g. "precast.WS.Savage Blade")
/// used for overwrite identity diagnostics; FriendlyName/Category are display-facing.</summary>
public record ParsedSet(string LuaKey, string FriendlyName, string Category, IReadOnlyList<ParsedSlot> Slots);

/// <summary>Result of parsing a whole file: the sets we could reconstruct plus
/// human-readable warnings for sets/slots we had to skip.</summary>
public record ParseResult(IReadOnlyList<ParsedSet> Sets, IReadOnlyList<string> Warnings);
