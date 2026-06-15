namespace Vanalytics.Core.DTOs.Workflows;

public class WorkflowGraphDto
{
    public int Version { get; set; } = 1;
    public List<WorkflowNodeDto> Nodes { get; set; } = [];
    public List<WorkflowEdgeDto> Edges { get; set; } = [];
}

public class WorkflowNodeDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;      // trigger:status_change | trigger:precast | trigger:aftercast | equip
    public WorkflowPositionDto Position { get; set; } = new();
    public WorkflowNodeDataDto Data { get; set; } = new();
}

public class WorkflowPositionDto
{
    public double X { get; set; }
    public double Y { get; set; }
}

public class WorkflowNodeDataDto
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
    public List<WorkflowModeMemberDto>? Members { get; set; }
}

public class WorkflowEdgeDto
{
    public string Id { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string? SourceHandle { get; set; }
    public string Target { get; set; } = string.Empty;
    public string? TargetHandle { get; set; }
}

public class WorkflowModeMemberDto
{
    /// <summary>An existing 16-slot Gear Set this mode cycles through.</summary>
    public long GearSetId { get; set; }

    /// <summary>Key under sets.&lt;NS&gt;[...]; defaults to the Gear Set's name when null/empty.</summary>
    public string? Label { get; set; }
}
