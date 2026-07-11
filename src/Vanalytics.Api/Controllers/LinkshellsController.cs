using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Soverance.Messaging.Services;
using Vanalytics.Api.DTOs;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Achievements;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LinkshellsController(
    VanalyticsDbContext db,
    IForumAttachmentStore assetStore,
    IMessagingService messaging) : ControllerBase
{
    // One application per (linkshell, user) per this window.
    private static readonly TimeSpan ApplyCooldown = TimeSpan.FromDays(30);
    private const int MaxIntroLength = 2000;

    [HttpGet]
    public async Task<IActionResult> GetDirectory([FromQuery] string? server)
    {
        var query = db.Linkshells.Where(l => l.MemberCount > 0 && l.IsPublic);
        if (!string.IsNullOrEmpty(server))
            query = query.Where(l => l.Server == server);

        // Project the recruitment status as its int-backed enum (a translatable
        // CASE over the optional profile nav) and stringify in memory, rather
        // than relying on Enum.ToString() translation inside the SQL projection.
        var rows = await query
            .Select(l => new
            {
                l.Id,
                l.Name,
                l.Server,
                l.ColorRgb,
                l.MemberCount,
                PublicMemberCount = l.Memberships.Count(m => m.IsCurrent && m.Character.IsPublic),
                l.LastSeenAt,
                LogoUrl = l.Profile != null ? l.Profile.LogoBlobUrl : null,
                RecruitmentStatus = l.Profile != null ? l.Profile.RecruitmentStatus : RecruitmentStatus.Unknown,
            })
            .ToListAsync();

        // Fetch achievement scores in a single query and merge in memory.
        var linkshellIds = rows.Select(r => r.Id).ToList();
        var achievementMap = await db.LinkshellAchievements
            .AsNoTracking()
            .Where(a => linkshellIds.Contains(a.LinkshellId))
            .Select(a => new { a.LinkshellId, a.TotalScore, a.AverageScore, a.RankedMemberCount })
            .ToDictionaryAsync(a => a.LinkshellId);

        var items = rows
            .OrderByDescending(r => r.MemberCount)
            .ThenBy(r => r.Name)
            .Select(r =>
            {
                achievementMap.TryGetValue(r.Id, out var ach);
                return new LinkshellListItem
                {
                    Name = r.Name,
                    Server = r.Server,
                    ColorRgb = r.ColorRgb,
                    MemberCount = r.MemberCount,
                    PublicMemberCount = r.PublicMemberCount,
                    LastActiveAt = r.LastSeenAt,
                    LogoUrl = r.LogoUrl,
                    RecruitmentStatus = r.RecruitmentStatus.ToString(),
                    TotalScore = ach?.TotalScore ?? 0,
                    AverageScore = ach?.AverageScore ?? 0,
                    RankedMemberCount = ach?.RankedMemberCount ?? 0,
                };
            })
            .ToList();

        return Ok(items);
    }

    // Name is the URL segment; an FFXI linkshell name never contains '/', so the
    // two-segment {server}/{name} template resolves it unambiguously.
    [HttpGet("{server}/{name}")]
    public async Task<IActionResult> GetProfile(string server, string name)
    {
        // Names are effectively unique per server; the deterministic tiebreak
        // (most current members, then most recently seen) keeps resolution safe
        // even in the theoretical duplicate-name case. MemberCount > 0 means the
        // LS has current members; an all-former LS is treated as not found.
        var ls = await db.Linkshells
            .Where(l => l.Server == server && l.Name == name && l.MemberCount > 0)
            .OrderByDescending(l => l.MemberCount)
            .ThenByDescending(l => l.LastSeenAt)
            .Include(l => l.Profile)
            .FirstOrDefaultAsync();

        if (ls is null) return NotFound();

        // Visibility gate: a private linkshell is loadable only by a viewer who
        // owns a character with a CURRENT membership in it (managers are a
        // subset). Anonymous or non-member viewers get 404, mirroring the
        // character privacy model. Character-level roster filtering below is
        // unaffected — the two privacy layers are independent.
        var viewerId = GetOptionalUserId();
        if (!ls.IsPublic && !await IsCurrentMemberAsync(viewerId, ls.Id))
            return NotFound();

        // Public current members, with their active job. AsSplitQuery avoids the
        // cartesian blow-up that timed out the public character profile.
        var publicMembers = await db.LinkshellMemberships
            .Where(m => m.LinkshellId == ls.Id && m.IsCurrent && m.Character.IsPublic)
            .Include(m => m.Character).ThenInclude(c => c.Jobs)
            .AsSplitQuery()
            .ToListAsync();

        // Sort on the LinkshellRank enum value itself (Leader=2, Sackholder=1,
        // Member=0) BEFORE stringifying, so the order can't silently de-sync from
        // the rank names. Name ascending within a rank.
        var rows = publicMembers
            .OrderByDescending(m => (int)m.Rank)
            .ThenBy(m => m.Character.Name)
            .Select(m =>
            {
                var active = m.Character.Jobs.FirstOrDefault(j => j.IsActive);
                return new LinkshellMemberRow
                {
                    Name = m.Character.Name,
                    Rank = m.Rank.ToString(),
                    Job = active?.JobId.ToString(),
                    Level = active?.Level,
                    LastSeen = m.LastSeenAt,
                };
            })
            .ToList();

        var canManage = await CanManageAsync(viewerId, ls.Id);
        var (applyState, cooldownUntil) = await ComputeApplyStateAsync(viewerId, ls);

        return Ok(new LinkshellProfileResponse
        {
            LinkshellId = ls.Id,
            Name = ls.Name,
            Server = ls.Server,
            ColorRgb = ls.ColorRgb,
            MemberCount = ls.MemberCount,
            PublicMemberCount = rows.Count,
            // MemberCount (all current) minus the named public rows = private
            // members. Clamp at 0 so a transient stale read can never render a
            // negative "+N private members".
            PrivateMemberCount = Math.Max(0, ls.MemberCount - rows.Count),
            LastActiveAt = ls.LastSeenAt,
            RecruitmentStatus = (ls.Profile?.RecruitmentStatus ?? RecruitmentStatus.Unknown).ToString(),
            CanManage = canManage,
            IsPublic = ls.IsPublic,
            ApplyState = applyState,
            CooldownUntil = cooldownUntil,
            Profile = ls.Profile is null ? null : ToCustomization(ls.Profile),
            Members = rows,
        });
    }

    /// <summary>
    /// Returns the cached achievement aggregate for a linkshell, including global/server
    /// dense ranks over all linkshells with at least one ranked member, and an ordered list
    /// of the linkshell's current public members with their per-LS ranks.
    /// Public — no authentication required (mirrors GetDirectory / GetProfile auth posture).
    /// </summary>
    [HttpGet("{id:guid}/achievement")]
    public async Task<IActionResult> GetAchievement(Guid id)
    {
        var agg = await db.LinkshellAchievements.AsNoTracking()
            .Include(a => a.Linkshell)
            .FirstOrDefaultAsync(a => a.LinkshellId == id);
        if (agg is null) return NotFound();

        // Visibility gate: mirrors GetProfile — private linkshells are 404 for
        // anonymous callers and non-members.
        var viewerId = GetOptionalUserId();
        if (!agg.Linkshell.IsPublic && !await IsCurrentMemberAsync(viewerId, agg.LinkshellId))
            return NotFound();

        // Dense 1-based global rank: count of linkshells with RankedMemberCount > 0
        // that score strictly higher than this one, plus 1. NULL when this LS itself
        // is unranked (RankedMemberCount == 0) — excluded from every leaderboard.
        int? globalRank = agg.RankedMemberCount > 0
            ? await db.LinkshellAchievements
                .Where(a => a.RankedMemberCount > 0 && a.TotalScore > agg.TotalScore)
                .CountAsync() + 1
            : null;

        // Same but scoped to the same server.
        int? serverRank = agg.RankedMemberCount > 0
            ? await db.LinkshellAchievements
                .Where(a => a.RankedMemberCount > 0
                         && a.Linkshell.Server == agg.Linkshell.Server
                         && a.TotalScore > agg.TotalScore)
                .CountAsync() + 1
            : null;

        // Current public members joined to their achievement rows, ordered by score desc
        // then name asc for deterministic ordering on ties.
        var members = await db.LinkshellMemberships
            .Where(m => m.LinkshellId == id && m.IsCurrent && m.Character.IsPublic)
            .Join(db.CharacterAchievements,
                  m => m.CharacterId,
                  a => a.CharacterId,
                  (m, a) => new
                  {
                      m.Character.Id,
                      m.Character.Name,
                      m.Character.Server,
                      a.TotalScore,
                      m.Character.LastSyncAt,
                      m.Character.Linkshell,
                  })
            .OrderByDescending(x => x.TotalScore)
            .ThenBy(x => x.Name)
            .ToListAsync();

        var memberEntries = members
            .Select((x, idx) => new CharacterLeaderboardEntry(
                idx + 1, x.Id, x.Name, x.Server, x.TotalScore, x.LastSyncAt, x.Linkshell))
            .ToList();

        return Ok(new LinkshellAchievementResponse(
            agg.TotalScore, agg.AverageScore, agg.RankedMemberCount,
            globalRank, serverRank,
            memberEntries));
    }

    [Authorize]
    [HttpPut("{linkshellId:guid}/profile")]
    public async Task<IActionResult> UpdateProfile(Guid linkshellId, [FromBody] UpdateLinkshellProfileRequest request)
    {
        var userId = GetUserId();
        if (!await CanManageAsync(userId, linkshellId)) return Forbid();

        var linkshell = await db.Linkshells.FirstOrDefaultAsync(l => l.Id == linkshellId);
        if (linkshell is null) return NotFound();
        if (request.IsPublic.HasValue) linkshell.IsPublic = request.IsPublic.Value;

        if (!Enum.TryParse<RecruitmentStatus>(request.RecruitmentStatus, ignoreCase: true, out var status))
            return BadRequest(new { error = "Invalid recruitment status." });

        if (!TryValidateLinks(request.ExternalLinks, out var cleanedLinks, out var linkError))
            return BadRequest(new { error = linkError });

        var profile = await GetOrCreateProfileAsync(linkshellId, userId);
        if (profile is null) return NotFound(); // linkshell id does not exist

        var prefix = assetStore.BaseUrl;
        profile.Description = string.IsNullOrWhiteSpace(request.Description)
            ? null : RichTextSanitizer.SanitizeImageSources(request.Description, prefix);
        profile.RecruitmentRules = string.IsNullOrWhiteSpace(request.RecruitmentRules)
            ? null : RichTextSanitizer.SanitizeImageSources(request.RecruitmentRules, prefix);
        profile.RecruitmentStatus = status;
        profile.ExternalLinksJson = JsonSerializer.Serialize(cleanedLinks);
        profile.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ToCustomization(profile));
    }

    [Authorize]
    [HttpPost("{linkshellId:guid}/apply")]
    public async Task<IActionResult> Apply(Guid linkshellId, [FromBody] ApplyToLinkshellRequest request)
    {
        var userId = GetUserId();

        var ls = await db.Linkshells
            .Include(l => l.Profile)
            .FirstOrDefaultAsync(l => l.Id == linkshellId);
        if (ls is null) return NotFound();

        var status = ls.Profile?.RecruitmentStatus ?? RecruitmentStatus.Unknown;
        if (status != RecruitmentStatus.Open)
            return Conflict(new { message = "This linkshell is not currently recruiting." });

        var intro = (request.Intro ?? "").Trim();
        if (intro.Length == 0)
            return BadRequest(new { message = "Please write a short introduction." });
        if (intro.Length > MaxIntroLength)
            return BadRequest(new { message = $"Introduction is too long ({MaxIntroLength} characters max)." });

        var character = await db.Characters.FirstOrDefaultAsync(c => c.Id == request.CharacterId);
        if (character is null || character.UserId != userId) return Forbid();
        if (character.Server != ls.Server)
            return BadRequest(new { message = "Choose a character on this linkshell's server." });

        var alreadyMember = await db.LinkshellMemberships.AnyAsync(m =>
            m.LinkshellId == linkshellId && m.IsCurrent && m.Character.UserId == userId);
        if (alreadyMember)
            return Conflict(new { message = "You are already a member of this linkshell." });

        var cutoff = DateTimeOffset.UtcNow - ApplyCooldown;
        var appliedRecently = await db.LinkshellApplications.AnyAsync(a =>
            a.LinkshellId == linkshellId && a.ApplicantUserId == userId && a.CreatedAt > cutoff);
        if (appliedRecently)
            return Conflict(new { message = "You have already applied to this linkshell recently." });

        // Resolve recipients: distinct owning users of CURRENT leader/sackholder
        // memberships, excluding the applicant. Every character has an owner, so
        // there is no null-user case to filter.
        var recipientIds = await db.LinkshellMemberships
            .Where(m => m.LinkshellId == linkshellId && m.IsCurrent
                && (m.Rank == LinkshellRank.Leader || m.Rank == LinkshellRank.Sackholder)
                && m.Character.UserId != userId)
            .Select(m => m.Character.UserId)
            .Distinct()
            .ToListAsync();

        if (recipientIds.Count == 0)
            return Conflict(new { message = "This linkshell has no reachable leaders to receive applications." });

        // Relative profile path; the web app renders it as a clickable in-app
        // link labelled with the character (e.g. "Soverance (Asura)").
        var profilePath = $"/{Uri.EscapeDataString(character.Server)}/{Uri.EscapeDataString(character.Name)}";
        var body = $"{intro}\n\n— Applying to {ls.Name} as {profilePath}";

        // Fan out one DM per recipient, best-effort. A recipient who has blocked
        // the applicant returns Blocked = true and is skipped silently (never
        // revealed); an unexpected send failure for one recipient must not abort
        // the others or the application record, so each send is isolated.
        var delivered = 0;
        foreach (var recipientId in recipientIds)
        {
            try
            {
                var result = await messaging.SendMessageAsync(userId, recipientId, body);
                if (!result.Blocked) delivered++;
            }
            catch
            {
                // Skip this recipient; the application still records and the
                // remaining leaders are still contacted.
            }
        }

        // Record the application AFTER fan-out so RecipientCount reflects actual
        // deliveries. The DM is the application; the row exists only for the
        // cooldown + button state. If this save fails the applicant gets a 500
        // and can retry (a leader may see a duplicate DM) — preferable to writing
        // the cooldown row first and silently failing to notify anyone.
        db.LinkshellApplications.Add(new LinkshellApplication
        {
            Id = Guid.NewGuid(),
            LinkshellId = linkshellId,
            ApplicantUserId = userId,
            CharacterId = character.Id,
            CreatedAt = DateTimeOffset.UtcNow,
            RecipientCount = delivered,
        });
        await db.SaveChangesAsync();

        return Ok(new { recipientCount = delivered });
    }

    private static readonly HashSet<string> AllowedLogoTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };
    private const long MaxLogoSize = 5 * 1024 * 1024; // 5 MB

    [Authorize]
    [HttpPost("{linkshellId:guid}/logo")]
    public async Task<IActionResult> UploadLogo(Guid linkshellId, IFormFile? file)
    {
        var userId = GetUserId();
        if (!await CanManageAsync(userId, linkshellId)) return Forbid();

        if (file is null || file.Length == 0) return BadRequest(new { error = "No file provided." });
        if (file.Length > MaxLogoSize) return BadRequest(new { error = "File size exceeds 5 MB limit." });
        if (!AllowedLogoTypes.Contains(file.ContentType))
            return BadRequest(new { error = "File type not allowed. Accepted: JPEG, PNG, GIF, WebP." });

        var profile = await GetOrCreateProfileAsync(linkshellId, userId);
        if (profile is null) return NotFound();

        var ext = file.ContentType switch
        {
            "image/jpeg" => ".jpg",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            _ => ".png",
        };
        var storagePath = $"linkshell-logos/{linkshellId}{ext}";
        using var stream = file.OpenReadStream();
        var url = await assetStore.SaveAsync(storagePath, stream, file.ContentType);

        profile.LogoBlobUrl = url;
        profile.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new { url });
    }

    [Authorize]
    [HttpDelete("{linkshellId:guid}/logo")]
    public async Task<IActionResult> DeleteLogo(Guid linkshellId)
    {
        var userId = GetUserId();
        if (!await CanManageAsync(userId, linkshellId)) return Forbid();

        var profile = await db.LinkshellProfiles.FirstOrDefaultAsync(p => p.LinkshellId == linkshellId);
        if (profile is null) return NoContent(); // nothing to clear

        // Clear the reference; leave/overwrite the blob (same lifecycle as avatars).
        profile.LogoBlobUrl = null;
        profile.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // === helpers ===

    // Live-computed eligibility: the caller owns a Character with a CURRENT
    // Leader/Sackholder membership on this linkshell. No editor table.
    private Task<bool> CanManageAsync(Guid? userId, Guid linkshellId)
    {
        if (userId is null) return Task.FromResult(false);
        return db.LinkshellMemberships.AnyAsync(m =>
            m.LinkshellId == linkshellId
            && m.Character.UserId == userId
            && m.IsCurrent
            && (m.Rank == LinkshellRank.Leader || m.Rank == LinkshellRank.Sackholder));
    }

    // Live-computed: the caller owns a Character with a CURRENT membership on
    // this linkshell (any rank). Gates private-linkshell visibility.
    private Task<bool> IsCurrentMemberAsync(Guid? userId, Guid linkshellId)
    {
        if (userId is null) return Task.FromResult(false);
        return db.LinkshellMemberships.AnyAsync(m =>
            m.LinkshellId == linkshellId
            && m.Character.UserId == userId
            && m.IsCurrent);
    }

    // Computes the Apply button state for a given viewer against a loaded LS
    // (its Profile must already be Included). Returns the state string plus the
    // cooldown-until instant when OnCooldown.
    private async Task<(string State, DateTimeOffset? CooldownUntil)> ComputeApplyStateAsync(Guid? userId, Linkshell ls)
    {
        var status = ls.Profile?.RecruitmentStatus ?? RecruitmentStatus.Unknown;
        if (status != RecruitmentStatus.Open) return ("Closed", null);
        if (userId is null) return ("NotLoggedIn", null);

        var isMember = await db.LinkshellMemberships.AnyAsync(m =>
            m.LinkshellId == ls.Id && m.IsCurrent && m.Character.UserId == userId);
        if (isMember) return ("AlreadyMember", null);

        var hasSameServerChar = await db.Characters.AnyAsync(c =>
            c.UserId == userId && c.Server == ls.Server);
        if (!hasSameServerChar) return ("NoEligibleCharacter", null);

        var lastAppliedAt = await db.LinkshellApplications
            .Where(a => a.LinkshellId == ls.Id && a.ApplicantUserId == userId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => (DateTimeOffset?)a.CreatedAt)
            .FirstOrDefaultAsync();
        if (lastAppliedAt is not null && lastAppliedAt.Value > DateTimeOffset.UtcNow - ApplyCooldown)
            return ("OnCooldown", lastAppliedAt.Value + ApplyCooldown);

        var hasReachableLeader = await db.LinkshellMemberships.AnyAsync(m =>
            m.LinkshellId == ls.Id && m.IsCurrent
            && (m.Rank == LinkshellRank.Leader || m.Rank == LinkshellRank.Sackholder)
            && m.Character.UserId != userId);
        if (!hasReachableLeader) return ("NoReachableLeaders", null);

        return ("Open", null);
    }

    // Returns the existing profile row, or a new (added, unsaved) one. Returns
    // null only when linkshellId does not match a real linkshell.
    private async Task<LinkshellProfile?> GetOrCreateProfileAsync(Guid linkshellId, Guid userId)
    {
        var profile = await db.LinkshellProfiles.FirstOrDefaultAsync(p => p.LinkshellId == linkshellId);
        if (profile is not null) return profile;

        if (!await db.Linkshells.AnyAsync(l => l.Id == linkshellId)) return null;

        profile = new LinkshellProfile
        {
            Id = Guid.NewGuid(),
            LinkshellId = linkshellId,
            OwnerUserId = userId,            // first claimant; attribution only
            RecruitmentStatus = RecruitmentStatus.Unknown,
            ExternalLinksJson = "[]",
        };
        db.LinkshellProfiles.Add(profile);
        return profile;
    }

    // Validates & normalizes external links: drops fully-empty rows, requires a
    // 1–40 char label + an absolute http(s) URL, max 5.
    private static bool TryValidateLinks(
        List<LinkshellExternalLink> input, out List<LinkshellExternalLink> cleaned, out string? error)
    {
        cleaned = [];
        error = null;
        foreach (var link in input)
        {
            var label = (link.Label ?? "").Trim();
            var url = (link.Url ?? "").Trim();
            if (label.Length == 0 && url.Length == 0) continue; // drop empty row
            if (label.Length is 0 or > 40)
            {
                error = "Each link needs a label of 1–40 characters.";
                return false;
            }
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)
                || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                error = "Each link URL must be an absolute http(s) URL.";
                return false;
            }
            cleaned.Add(new LinkshellExternalLink { Label = label, Url = url });
        }
        if (cleaned.Count > 5)
        {
            error = "At most 5 links are allowed.";
            return false;
        }
        return true;
    }

    private static LinkshellCustomization ToCustomization(LinkshellProfile p) => new()
    {
        LogoUrl = p.LogoBlobUrl,
        Description = p.Description,
        RecruitmentRules = p.RecruitmentRules,
        ExternalLinks = JsonSerializer.Deserialize<List<LinkshellExternalLink>>(p.ExternalLinksJson) ?? [],
    };

    private Guid? GetOptionalUserId()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return sub != null ? Guid.Parse(sub) : null;
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
