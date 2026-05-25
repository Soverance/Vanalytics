namespace Vanalytics.Core.Models;

// 1:1 with Character. Populated by the addon's collection.sync, which
// reads windower.ffxi.get_spells() and windower.ffxi.get_key_items() on
// each sync. JSON blobs because these are read-mostly bitfield-style
// collections — no cross-character queries needed.
//
// Trusts are stored within SpellIds (they're a spell type per FFXI's
// internal model). The UI splits them at render time.
public class CharacterCollection
{
    public Guid CharacterId { get; set; }

    public string? SpellIdsJson { get; set; }
    public string? KeyItemIdsJson { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
