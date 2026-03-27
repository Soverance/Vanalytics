using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class InventoryMoveOrderConfiguration : IEntityTypeConfiguration<InventoryMoveOrder>
{
    public void Configure(EntityTypeBuilder<InventoryMoveOrder> builder)
    {
        builder.HasKey(m => m.Id);

        builder.HasIndex(m => new { m.CharacterId, m.Status });

        builder.HasOne(m => m.Character)
            .WithMany()
            .HasForeignKey(m => m.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
