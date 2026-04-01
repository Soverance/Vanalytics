namespace Vanalytics.Core.DTOs.Admin;

public class AdminUserResponse
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool IsSystemAccount { get; set; }
    public bool HasApiKey { get; set; }
    public string? OAuthProvider { get; set; }
    public int CharacterCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
