using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Characters;

public class CreateCharacterRequest
{
    [Required, MaxLength(64)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;
}
