using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

// Posted by the addon to /api/sync/collection. Both fields are optional —
// if the addon couldn't read one of the Windower APIs, it omits that
// field rather than blanking the server-side value.
public class CollectionSyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    // From windower.ffxi.get_spells() — includes trusts (Trust is a spell type).
    public List<int>? SpellIds { get; set; }

    // From windower.ffxi.get_key_items().
    public List<int>? KeyItemIds { get; set; }
}
