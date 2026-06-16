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
    public string Type { get; set; } = string.Empty;      // trigger:status_change | trigger:precast | trigger:aftercast | equip | combine
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

    /// <summary>Set only on `combine` nodes: ordered component Gear Set ids merged via set_combine.
    /// Index 0 is the base; the last id wins on any slot it fills (set_combine is right-most-wins).</summary>
    public List<long>? CombineSetIds { get; set; }

    /// <summary>On an `equip` leaf: ordered override layers applied on top of <see cref="GearSetId"/>
    /// (the base). Appended after the base in set_combine; the last entry wins. Empty/null = a plain equip.</summary>
    public List<long>? OverlaySetIds { get; set; }
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

    /// <summary>When set, this member IS the referenced `combine` node (set_combine of its components)
    /// instead of a single Gear Set. When null, <see cref="GearSetId"/> is used as today.</summary>
    public string? CombineNodeId { get; set; }

    /// <summary>Override layers applied on top of <see cref="GearSetId"/> for this member; empty/null =
    /// a plain inline member. With overlays the member emits sets.&lt;NS&gt;['label'] = set_combine(...).</summary>
    public List<long>? OverlaySetIds { get; set; }
}
