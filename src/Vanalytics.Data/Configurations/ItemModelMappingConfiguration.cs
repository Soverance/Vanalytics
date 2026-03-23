using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ItemModelMappingConfiguration : IEntityTypeConfiguration<ItemModelMapping>
{
    public void Configure(EntityTypeBuilder<ItemModelMapping> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => new { m.ItemId, m.SlotId }).IsUnique();
        builder.HasIndex(m => m.ModelId);
    }
}
