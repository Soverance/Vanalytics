namespace Vanalytics.Core.DTOs.Characters;

public class UpdateCharacterRequest
{
    public bool IsPublic { get; set; }
    public FavoriteAnimationDto? FavoriteAnimation { get; set; }
    // Enum name (case-insensitive), e.g. "Main". Null/blank -> "None".
    public string? Role { get; set; }
}
