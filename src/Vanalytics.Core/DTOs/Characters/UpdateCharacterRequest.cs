namespace Vanalytics.Core.DTOs.Characters;

public class UpdateCharacterRequest
{
    public bool IsPublic { get; set; }
    public FavoriteAnimationDto? FavoriteAnimation { get; set; }
}
