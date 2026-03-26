using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Session;

public class SessionStartRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Zone { get; set; } = string.Empty;
}
