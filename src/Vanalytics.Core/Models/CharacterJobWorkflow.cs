namespace Vanalytics.Core.Models;

/// <summary>
/// A player's visual GearSwap workflow graph for one (character, job). The graph is stored
/// whole as a versioned JSON document (nodes + edges) — a workflow is read/written as a unit,
/// so unlike GearSetSlot it is intentionally NOT normalized. One row per (CharacterId, Job).
/// </summary>
public class CharacterJobWorkflow
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }

    /// <summary>Canonical uppercase job code, e.g. "THF".</summary>
    public string Job { get; set; } = string.Empty;

    /// <summary>The canonical empty graph: version 1, no nodes, no edges.</summary>
    public const string EmptyGraphJson = "{\"version\":1,\"nodes\":[],\"edges\":[]}";

    /// <summary>Serialized WorkflowGraphDto ({ version, nodes, edges }).</summary>
    public string GraphJson { get; set; } = EmptyGraphJson;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
