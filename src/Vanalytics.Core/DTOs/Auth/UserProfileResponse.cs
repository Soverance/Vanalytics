namespace Vanalytics.Core.DTOs.Auth;

public class UserProfileResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public bool HasApiKey { get; set; }
    public string? OAuthProvider { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
