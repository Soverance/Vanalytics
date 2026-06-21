namespace Vanalytics.Core.DTOs.Blueprints;

public class BlueprintGraphDto
{
    public int Version { get; set; } = 1;
    public List<BlueprintNodeDto> Nodes { get; set; } = [];
    public List<BlueprintEdgeDto> Edges { get; set; } = [];
}

public class BlueprintNodeDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;      // trigger:* | equip | mode | branch | value | buff | spell | op:compare | op:and | op:or | op:not | comment | setup | lua | print
    public BlueprintPositionDto Position { get; set; } = new();
    public BlueprintNodeDataDto Data { get; set; } = new();
}

public class BlueprintPositionDto
{
    public double X { get; set; }
    public double Y { get; set; }
}

public class BlueprintNodeDataDto
{
    /// <summary>Set only on leaf (equip) nodes: which Gear Set this node equips.</summary>
    public long? GearSetId { get; set; }

    /// <summary>On a leaf wired to a category pin (precast): the specific action this leaf gears for,
    /// e.g. "Mercy Stroke". Null = generic default ("Any Weapon Skill") or a terminal status leaf.</summary>
    public string? ActionName { get; set; }

    /// <summary>Set only on `mode` nodes: the mode's display name, e.g. "TP" / "Idle". Drives the Lua
    /// namespace (sets.TP, TP_Index) and the default cycle command.</summary>
    public string? ModeName { get; set; }

    /// <summary>On a `mode` node: an override macro command. Null/empty = derived "cycle &lt;ModeName&gt; set".</summary>
    public string? ModeCommand { get; set; }

    /// <summary>On a `mode` node: ordered member sets. Index 1 (first) is the default.</summary>
    public List<BlueprintModeMemberDto>? Members { get; set; }

    /// <summary>On an `equip` leaf: ordered override layers applied on top of <see cref="GearSetId"/>
    /// (the base). Appended after the base in set_combine; the last entry wins. Empty/null = a plain equip.</summary>
    public List<long>? OverlaySetIds { get; set; }

    /// <summary>On a `buff` node: the buff's RAW en (e.g. "Sneak Attack", "doom"). Lowercased at
    /// codegen for the buffactive[...] key. Display uses the Title-Case label.</summary>
    public string? BuffName { get; set; }

    /// <summary>On a `value` node: the numeric source — a player stat (hp/hpp/mp/mpp/tp →
    /// player.&lt;r&gt;), pet.tp, pet.hpp, or world.moon (→ world.moon.percent). On an `op:compare`
    /// node's own (unwired) source: a player stat only (hp/hpp/mp/mpp/tp).</summary>
    public string? Resource { get; set; }

    /// <summary>On an `op:compare` node: the Lua comparison operator, one of &lt; &lt;= &gt; &gt;= == ~=.</summary>
    public string? Op { get; set; }

    /// <summary>On an `op:compare` node: the numeric threshold (e.g. 25 for player.hpp &lt; 25).</summary>
    public int? Value { get; set; }

    /// <summary>On a `spell` node: which spell field to test — "name" | "skill" | "element".</summary>
    public string? SpellField { get; set; }

    /// <summary>On a `spell` node: the value to compare against — an action's raw english name
    /// (field "name"), a skill name (field "skill"), or an element (field "element"). Emitted
    /// verbatim (NOT case-folded) as a Lua string literal.</summary>
    public string? SpellValue { get; set; }

    /// <summary>On a `pet` node: which pet field to test — "exists" (pet.isvalid) or "status"
    /// (pet.status == PetValue).</summary>
    public string? PetField { get; set; }

    /// <summary>On a `pet` node with field "status": the pet status to match (e.g. "Engaged").</summary>
    public string? PetValue { get; set; }

    /// <summary>On a `world` node: which world field to test — "weather"/"day" (element equality),
    /// "moghouse" (world.in_mog_house), or "zone" (world.zone_id == WorldValue).</summary>
    public string? WorldField { get; set; }

    /// <summary>On a `world` node: the value to match — an element name (weather/day) or a numeric
    /// zone id as a string (zone). Null for "moghouse".</summary>
    public string? WorldValue { get; set; }

    /// <summary>On a `world` zone node: the zone's display name (for the node face/inspector only;
    /// codegen compares WorldValue as the numeric zone id).</summary>
    public string? WorldLabel { get; set; }

    /// <summary>On a `comment` node: the free-text label (documentation only — never emitted to Lua).</summary>
    public string? Text { get; set; }

    /// <summary>On a `comment` node: the frame width in flow units (persisted so resize survives reload).</summary>
    public double? Width { get; set; }

    /// <summary>On a `comment` node: the frame height in flow units.</summary>
    public double? Height { get; set; }

    /// <summary>On a `setup` (file-top, singleton) or `lua` (in-event) node: raw Lua emitted
    /// verbatim — the escape hatch. `setup` goes at file top; `lua` is an exec statement in an event.</summary>
    public string? Code { get; set; }

    /// <summary>On a `print` node: the chat message text. Emitted as a single-quoted Lua literal in
    /// add_to_chat(ChatColor, '<ChatText>').</summary>
    public string? ChatText { get; set; }

    /// <summary>On a `print` node: the FFXI/Windower add_to_chat color code. Null falls back to the
    /// generator default.</summary>
    public int? ChatColor { get; set; }
}

public class BlueprintEdgeDto
{
    public string Id { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string? SourceHandle { get; set; }
    public string Target { get; set; } = string.Empty;
    public string? TargetHandle { get; set; }
}

public class BlueprintModeMemberDto
{
    /// <summary>An existing 16-slot Gear Set this mode cycles through.</summary>
    public long GearSetId { get; set; }

    /// <summary>Key under sets.&lt;NS&gt;[...]; defaults to the Gear Set's name when null/empty.</summary>
    public string? Label { get; set; }

    /// <summary>Override layers applied on top of <see cref="GearSetId"/> for this member; empty/null =
    /// a plain inline member. With overlays the member emits sets.&lt;NS&gt;['label'] = set_combine(...).</summary>
    public List<long>? OverlaySetIds { get; set; }
}
