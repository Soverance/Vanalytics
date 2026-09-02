namespace Vanalytics.Core.DTOs.Characters;

public class CurrencyResponse
{
    public Dictionary<string, long> Currencies { get; set; } = new();

    public DateTimeOffset? UpdatedAt { get; set; }
}
