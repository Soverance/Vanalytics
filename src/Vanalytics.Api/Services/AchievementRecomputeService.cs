using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Controllers;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.Achievements;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

/// <summary>
/// Materializes achievement scores. Reads a character's synced state, runs the pure
/// <see cref="AchievementScoringService"/>, and upserts the 1:1 <see cref="CharacterAchievement"/>
/// row, then re-aggregates every current linkshell the character belongs to. Called at the
/// end of each sync (best-effort) and by the admin rescore batch.
/// </summary>
public class AchievementRecomputeService(VanalyticsDbContext db)
{
    // Missions/collection/warps were serialized with camelCase, case-insensitive options
    // (matching CharactersController.JsonOpts). Merits use DEFAULT options (see CountMerits).
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public async Task RecomputeCharacterAsync(Guid characterId, CancellationToken ct = default)
    {
        var ch = await db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.CraftingSkills)
            .Include(c => c.Skills)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Id == characterId, ct);
        if (ch is null) return;

        var progression = await db.CharacterProgression.FindAsync([characterId], ct);
        var missions = await db.CharacterMissions.FindAsync([characterId], ct);
        var collection = await db.CharacterCollection.FindAsync([characterId], ct);
        var titleCount = await db.CharacterTitles.CountAsync(t => t.CharacterId == characterId, ct);
        var uwRanks = await CharactersController.OwnedUltimateWeaponRanksAsync(db, characterId);

        var (spells, trusts) = CountSpellsAndTrusts(collection?.SpellIdsJson);

        var input = new AchievementScoreInput
        {
            JobLevels = ch.Jobs.Select(j => j.Level).ToList(),
            MasterLevels = ch.Jobs.Select(j => j.MasterLevel ?? 0).ToList(),
            SuperiorLevel = ch.SuperiorLevel ?? 0,
            UltimateWeaponRanks = uwRanks,
            CompletedMissionLines = CountMissions(missions?.MissionsJson),
            JpSpentByJob = ch.Jobs.Select(j => j.JPSpent).ToList(),
            MeritsSpent = CountMerits(ch.MeritsJson),
            SpellsLearned = spells,
            TrustsLearned = trusts,
            TitlesCollected = titleCount,
            KeyItemsHeld = CountKeyItems(collection?.KeyItemIdsJson),
            CraftLevels = ch.CraftingSkills.Select(c => c.Level).ToList(),
            Skills = ch.Skills.Select(s => new SkillProgress(s.Level, s.Cap)).ToList(),
            WarpsUnlocked = CountWarps(progression?.WarpsJson),
            NationRank = ch.NationRank ?? 0,
        };

        var score = AchievementScoringService.Score(input);
        var row = await db.CharacterAchievements.FindAsync([characterId], ct);
        if (row is null)
        {
            row = new CharacterAchievement { CharacterId = characterId };
            db.CharacterAchievements.Add(row);
        }
        row.TotalScore = score.Total;
        row.BreakdownJson = JsonSerializer.Serialize(score.Categories);
        row.RubricVersion = AchievementRubric.Version;
        row.ComputedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        var lsIds = await db.LinkshellMemberships
            .Where(m => m.CharacterId == characterId && m.IsCurrent)
            .Select(m => m.LinkshellId).ToListAsync(ct);
        foreach (var lsId in lsIds) await RecomputeLinkshellAsync(lsId, ct);
    }

    public async Task RecomputeLinkshellAsync(Guid linkshellId, CancellationToken ct = default)
    {
        var scores = await db.LinkshellMemberships
            .Where(m => m.LinkshellId == linkshellId && m.IsCurrent && m.Character.IsPublic)
            .Join(db.CharacterAchievements, m => m.CharacterId, a => a.CharacterId, (_, a) => a.TotalScore)
            .ToListAsync(ct);

        var row = await db.LinkshellAchievements.FindAsync([linkshellId], ct);
        if (row is null)
        {
            row = new LinkshellAchievement { LinkshellId = linkshellId };
            db.LinkshellAchievements.Add(row);
        }
        row.TotalScore = scores.Sum();
        row.RankedMemberCount = scores.Count;
        row.AverageScore = scores.Count == 0 ? 0 : (double)scores.Sum() / scores.Count;
        row.ComputedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> RecomputeAllAsync(CancellationToken ct = default)
    {
        var ids = await db.Characters.Select(c => c.Id).ToListAsync(ct);
        foreach (var id in ids) await RecomputeCharacterAsync(id, ct);

        var lsIds = await db.Linkshells.Select(l => l.Id).ToListAsync(ct);
        foreach (var id in lsIds) await RecomputeLinkshellAsync(id, ct);
        return ids.Count;
    }

    // ── JSON decoders (internal for direct unit testing; see AchievementDecoderTests) ──

    // Missions: Dictionary<camelCase line key, MissionLineState{Completed:List<int>?, Current:int?}>.
    internal static int CountMissions(string? json)
    {
        if (string.IsNullOrEmpty(json)) return 0;
        var dict = JsonSerializer.Deserialize<Dictionary<string, MissionLineState>>(json, JsonOpts);
        return dict is null ? 0 : MissionProgress.CountCompletedLines(dict);
    }

    // Merits: Dictionary<meritCategoryName, pointsAllocated> serialized with DEFAULT opts.
    // Spent = sum of allocated points across categories.
    internal static int CountMerits(string? json)
    {
        if (string.IsNullOrEmpty(json)) return 0;
        var dict = JsonSerializer.Deserialize<Dictionary<string, int>>(json);
        return dict is null ? 0 : dict.Values.Sum();
    }

    // Spells + trusts in one pass: SpellIdsJson = List<int>. Trust <=> id >= 896.
    internal static (int spells, int trusts) CountSpellsAndTrusts(string? json)
    {
        if (string.IsNullOrEmpty(json)) return (0, 0);
        var ids = JsonSerializer.Deserialize<List<int>>(json, JsonOpts);
        if (ids is null) return (0, 0);
        int trusts = ids.Count(id => id >= 896);
        return (ids.Count - trusts, trusts);
    }

    // Key items: KeyItemIdsJson = List<int>. Count = list length.
    internal static int CountKeyItems(string? json)
    {
        if (string.IsNullOrEmpty(json)) return 0;
        return JsonSerializer.Deserialize<List<int>>(json, JsonOpts)?.Count ?? 0;
    }

    // Warps: WarpsJson = WarpUnlocks with 7 List<int> fields. Total = sum of all 7 counts.
    internal static int CountWarps(string? json)
    {
        if (string.IsNullOrEmpty(json)) return 0;
        var w = JsonSerializer.Deserialize<WarpUnlocks>(json, JsonOpts);
        if (w is null) return 0;
        return w.HomePoints.Count + w.SurvivalGuides.Count + w.Waypoints.Count
             + w.Telepoints.Count + w.CavernousMaws.Count + w.Lycopodium.Count + w.EschanPortals.Count;
    }
}
