namespace Vanalytics.Core.Models;

public class ZoneSpawn
{
    public int Id { get; set; }
    public int ZoneId { get; set; }
    public int GroupId { get; set; }
    public int? PoolId { get; set; }
    public string MobName { get; set; } = string.Empty;
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    public float Rotation { get; set; }
    public int MinLevel { get; set; }
    public int MaxLevel { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
