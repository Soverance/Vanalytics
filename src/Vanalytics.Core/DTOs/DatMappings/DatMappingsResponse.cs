namespace Vanalytics.Core.DTOs.DatMappings;

public class DatMappingsResponse
{
    public DateTimeOffset GeneratedAt { get; set; }
    public List<EquipmentDatEntry> Equipment { get; set; } = [];
    public List<NpcDatEntry> Npcs { get; set; } = [];
    public List<ZoneDatEntry> Zones { get; set; } = [];
    public List<FaceDatEntry> Faces { get; set; } = [];
    public List<SkeletonDatEntry> Skeletons { get; set; } = [];
    public List<AnimationDatEntry> Animations { get; set; } = [];
    public Dictionary<string, string> DatNames { get; set; } = new();
}

public class EquipmentDatEntry
{
    public string Name { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public string Slot { get; set; } = string.Empty;
    public int ModelId { get; set; }
    public Dictionary<string, string> DatPaths { get; set; } = new();
}

public class NpcDatEntry
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string DatPath { get; set; } = string.Empty;
}

public class ZoneDatEntry
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ModelPath { get; set; }
    public string? DialogPath { get; set; }
    public string? NpcPath { get; set; }
    public string? EventPath { get; set; }
    public List<string> MapPaths { get; set; } = [];
}

public class FaceDatEntry
{
    public string Race { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string DatPath { get; set; } = string.Empty;
}

public class SkeletonDatEntry
{
    public string Race { get; set; } = string.Empty;
    public string DatPath { get; set; } = string.Empty;
}

public class AnimationDatEntry
{
    public string Race { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<string> DatPaths { get; set; } = [];
}
