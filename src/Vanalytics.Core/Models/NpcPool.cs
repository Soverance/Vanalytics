namespace Vanalytics.Core.Models;

public class NpcPool
{
    public int Id { get; set; }
    public int PoolId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? PacketName { get; set; }
    public int FamilyId { get; set; }
    /// <summary>
    /// Primary visual model ID. For monsters (non-humanoid), this is the model file identifier.
    /// For humanoid NPCs, this is the race ID.
    /// </summary>
    public int ModelId { get; set; }
    /// <summary>
    /// True if this is a monster/beast model (race slot = 0), false if humanoid NPC.
    /// Monster models are self-contained DATs with embedded skeletons.
    /// </summary>
    public bool IsMonster { get; set; }
    /// <summary>
    /// Raw 20-byte modelid from mob_pools.sql stored as hex (40 chars).
    /// Contains 10 uint16 slots: race, face, head, body, hands, legs, feet, main, sub, ranged.
    /// </summary>
    public string ModelData { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
