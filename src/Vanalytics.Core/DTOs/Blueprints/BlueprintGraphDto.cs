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
    public string Type { get; set; } = string.Empty;      // trigger:* | equip | mode | branch | cond:buff | cond:stat
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

    /// <summary>On a `cond:buff` node: the buff's RAW en (e.g. "Sneak Attack", "doom"). Lowercased at
    /// codegen for the buffactive[...] key. Display uses the Title-Case label.</summary>
    public string? BuffName { get; set; }

    /// <summary>On a `cond:stat` node: the player field to test — one of hp, hpp, mp, mpp, tp
    /// (used verbatim as player.&lt;Resource&gt;).</summary>
    public string? Resource { get; set; }

    /// <summary>On a `cond:stat` node: the Lua comparison operator, one of &lt; &lt;= &gt; &gt;= == ~=.</summary>
    public string? Op { get; set; }

    /// <summary>On a `cond:stat` node: the numeric threshold (e.g. 25 for player.hpp &lt; 25).</summary>
    public int? Value { get; set; }
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
