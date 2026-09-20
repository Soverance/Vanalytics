namespace Vanalytics.Core.Models;

// 1:1 with Character. Populated by the addon's satellite sync from packets
// 0x113 (Currencies I) and 0x118 (Currencies II). The flat { key: value } map
// is stored as one JSON blob so the schema doesn't grow when the currency
// catalog changes.
public class CharacterCurrencies
{
    public Guid CharacterId { get; set; }

    public string? CurrenciesJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
