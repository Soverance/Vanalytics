using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class OAuthRequest
{
    [Required]
    public string Code { get; set; } = string.Empty;

    [Required]
    public string RedirectUri { get; set; } = string.Empty;
}
