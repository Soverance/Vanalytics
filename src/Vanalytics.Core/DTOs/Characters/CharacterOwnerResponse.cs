namespace Vanalytics.Core.DTOs.Characters;

/// <summary>
/// Public identity of the account that owns a public character, plus whether
/// the current viewer may send that owner a private message. Returned by
/// GET /api/profiles/{server}/{name}/owner.
/// </summary>
public class CharacterOwnerResponse
{
    public Guid OwnerUserId { get; set; }
    public string OwnerUsername { get; set; } = string.Empty;
    public string? OwnerDisplayName { get; set; }
    public string? OwnerAvatarUrl { get; set; }

    /// <summary>
    /// True only when the viewer is authenticated, is not the owner, and no
    /// block exists in either direction between viewer and owner.
    /// </summary>
    public bool CanMessage { get; set; }
}
