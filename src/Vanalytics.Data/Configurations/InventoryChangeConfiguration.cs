using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class InventoryChangeConfiguration : IEntityTypeConfiguration<InventoryChange>
{
    public void Configure(EntityTypeBuilder<InventoryChange> builder)
    {
        builder.HasKey(c => c.Id);

        builder.HasIndex(c => new { c.CharacterId, c.ChangedAt });

        builder.HasOne(c => c.Character)
            .WithMany()
            .HasForeignKey(c => c.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
