using System.Text.Json;
using System.Text.Json.Serialization;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

/// <summary>
/// Hand-authored memorial character profiles, loaded from Data/memorials/*.json.
/// Memorials are frozen tributes for characters that can never sync (see the
/// 2026-08-05 memorial-page design doc). They never enter the DB — the profile
/// endpoints fall back to this store when no DB character matches.
/// </summary>
public class MemorialProfileStore
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private readonly string _dir;
    private readonly ILogger<MemorialProfileStore> _logger;
    private readonly Lazy<Dictionary<(string Server, string Name), MemorialProfile>> _profiles;

    public MemorialProfileStore(string memorialsDir, ILogger<MemorialProfileStore> logger)
    {
        _dir = memorialsDir;
        _logger = logger;
        _profiles = new(Load);
    }

    public MemorialProfile? Find(string server, string name) =>
        _profiles.Value.GetValueOrDefault((server.ToLowerInvariant(), name.ToLowerInvariant()));

    private Dictionary<(string, string), MemorialProfile> Load()
    {
        var result = new Dictionary<(string, string), MemorialProfile>();
        if (!Directory.Exists(_dir)) return result;

        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            try
            {
                var profile = JsonSerializer.Deserialize<MemorialProfile>(
                    File.ReadAllText(file), JsonOptions);
                if (profile is null || profile.Server.Length == 0 || profile.Name.Length == 0)
                {
                    _logger.LogWarning("Memorial file {File} missing server/name; skipped", file);
                    continue;
                }
                result[(profile.Server.ToLowerInvariant(), profile.Name.ToLowerInvariant())] = profile;
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Memorial file {File} is malformed; skipped", file);
            }
        }
        return result;
    }
}

public class MemorialProfile
{
    public Guid Id { get; set; }
    public string Server { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Dedication { get; set; }
    public Race? Race { get; set; }
    public Gender? Gender { get; set; }
    public int? FaceModelId { get; set; }
    public int? Nation { get; set; }
    public int? NationRank { get; set; }
    public string? Title { get; set; }
    public string? SubJob { get; set; }
    public int? SubJobLevel { get; set; }
    public List<MemorialJob> Jobs { get; set; } = [];
    public List<MemorialCraft> CraftingSkills { get; set; } = [];
    public List<MemorialGear> Gear { get; set; } = [];

    /// <summary>In-memory Character for the existing MapToDetail pipeline. Never persisted.</summary>
    public Character ToCharacter() => new()
    {
        Id = Id,
        Name = Name,
        Server = Server,
        IsPublic = true,
        Race = Race,
        Gender = Gender,
        FaceModelId = FaceModelId,
        Nation = Nation,
        NationRank = NationRank,
        Title = Title,
        SubJob = SubJob,
        SubJobLevel = SubJobLevel,
        Jobs = Jobs.Select(j => new CharacterJob { JobId = j.Job, Level = j.Level, IsActive = j.IsActive }).ToList(),
        CraftingSkills = CraftingSkills.Select(s => new CraftingSkill { Craft = s.Craft, Level = s.Level, Rank = s.Rank }).ToList(),
        Gear = Gear.Select(g => new EquippedGear { Slot = g.Slot, ItemId = g.ItemId, ItemName = g.ItemName }).ToList(),
    };
}

public class MemorialJob
{
    public JobType Job { get; set; }
    public int Level { get; set; }
    public bool IsActive { get; set; }
}

public class MemorialCraft
{
    public CraftType Craft { get; set; }
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;
}

public class MemorialGear
{
    public EquipSlot Slot { get; set; }
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
}
