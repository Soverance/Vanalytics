namespace Vanalytics.Core.Models;

public class ItemModelMapping
{
    public int Id { get; set; }
    public int ItemId { get; set; }
    public int SlotId { get; set; }
    public int ModelId { get; set; }
    public ModelMappingSource Source { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public enum ModelMappingSource
{
    Static,
    Addon
}
