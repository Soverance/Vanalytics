using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

// Payload posted by the addon to /api/sync/currencies. Data comes from FFXI
// server packets 0x113 (Currencies I) and 0x118 (Currencies II). The addon
// decodes a curated set of fields into a flat { key: value } map keyed by the
// same strings the web catalog uses.
public class CurrenciesSyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    public Dictionary<string, long>? Currencies { get; set; }
}
