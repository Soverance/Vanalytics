using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Auth;

public class RefreshRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}
