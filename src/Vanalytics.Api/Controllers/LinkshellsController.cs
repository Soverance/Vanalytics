using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.DTOs;
using Vanalytics.Api.Services;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LinkshellsController(
    VanalyticsDbContext db,
    IForumAttachmentStore assetStore) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetDirectory([FromQuery] string? server)
    {
        var query = db.Linkshells.Where(l => l.MemberCount > 0);
        if (!string.IsNullOrEmpty(server))
            query = query.Where(l => l.Server == server);

        var items = await query
            .Select(l => new LinkshellListItem
            {
                Name = l.Name,
                Server = l.Server,
                ColorRgb = l.ColorRgb,
                MemberCount = l.MemberCount,
                PublicMemberCount = l.Memberships.Count(m => m.IsCurrent && m.Character.IsPublic),
                LastActiveAt = l.LastSeenAt,
                LogoUrl = l.Profile != null ? l.Profile.LogoBlobUrl : null,
            })
            .ToListAsync();

        return Ok(items.OrderByDescending(i => i.MemberCount).ThenBy(i => i.Name).ToList());
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

        var canManage = await CanManageAsync(GetOptionalUserId(), ls.Id);

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
            Profile = ls.Profile is null ? null : ToCustomization(ls.Profile),
            Members = rows,
        });
    }

    [Authorize]
    [HttpPut("{linkshellId:guid}/profile")]
    public async Task<IActionResult> UpdateProfile(Guid linkshellId, [FromBody] UpdateLinkshellProfileRequest request)
    {
        var userId = GetUserId();
        if (!await CanManageAsync(userId, linkshellId)) return Forbid();

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
