namespace Vanalytics.Core.DTOs.Characters;

public class CollectionResponse
{
    public List<int>? SpellIds { get; set; }
    public List<int>? KeyItemIds { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
}
