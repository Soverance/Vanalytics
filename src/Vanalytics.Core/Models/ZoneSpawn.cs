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
    /// <summary>
    /// LSB mob_groups.spawntype bitmask. 0 = normal respawn; non-zero values
    /// (1=attack, 2=timed, 4=script, 8/16=lights/darks day, 32=moon phase,
    /// 64=fog, etc.) are characteristic of NM / event spawns. Used together
    /// with low spawn-count to classify mobs as Notorious Monsters.
    /// </summary>
    public int SpawnType { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
