namespace Vanalytics.Core.Models;

public class Zone
{
    public int Id { get; set; }                        // FFXI zone ID, NOT auto-increment
    public string Name { get; set; } = string.Empty;
    public string? ModelPath { get; set; }             // Zone geometry DAT (e.g., "ROM/0/120.DAT")
    public string? DialogPath { get; set; }
    public string? NpcPath { get; set; }               // Spawn data DAT
    public string? EventPath { get; set; }
    public string? MapPaths { get; set; }              // Semicolon-delimited minimap DAT paths
    public string? Expansion { get; set; }             // "Original", "Rise of the Zilart", etc.
    public string? Region { get; set; }                // From LandSandBoat zone_settings
    public bool IsDiscovered { get; set; }             // false=seed data, true=scanner-found
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
