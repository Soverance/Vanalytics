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
    /// <summary>Set only on equip nodes: which Gear Set this node equips.</summary>
    public long? GearSetId { get; set; }
}

public class WorkflowEdgeDto
{
    public string Id { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string? SourceHandle { get; set; }
    public string Target { get; set; } = string.Empty;
    public string? TargetHandle { get; set; }
}
