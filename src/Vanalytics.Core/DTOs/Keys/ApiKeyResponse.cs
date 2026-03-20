namespace Vanalytics.Core.DTOs.Keys;

public class ApiKeyResponse
{
    public string ApiKey { get; set; } = string.Empty;
    public DateTimeOffset GeneratedAt { get; set; }
}
