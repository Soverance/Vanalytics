using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class GearSetSlotConfiguration : IEntityTypeConfiguration<GearSetSlot>
{
    public void Configure(EntityTypeBuilder<GearSetSlot> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.Slot).HasMaxLength(20).IsRequired();
        builder.Property(s => s.ItemName).HasMaxLength(100).IsRequired();
        builder.Property(s => s.AugmentsJson).HasColumnType("nvarchar(max)");

        // Reverse lookup for the item-detail "In Gear Sets" section.
        builder.HasIndex(s => s.ItemId);
        // Forward lookup when loading a set's slots.
        builder.HasIndex(s => s.GearSetId);

        builder.HasOne(s => s.GearSet)
            .WithMany(g => g.Slots)
            .HasForeignKey(s => s.GearSetId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
