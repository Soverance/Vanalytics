using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class EquippedGearConfiguration : IEntityTypeConfiguration<EquippedGear>
{
    public void Configure(EntityTypeBuilder<EquippedGear> builder)
    {
        builder.HasKey(g => g.Id);
        builder.HasIndex(g => new { g.CharacterId, g.Slot }).IsUnique();

        builder.Property(g => g.Slot)
            .HasConversion<string>()
            .HasMaxLength(16);
        builder.Property(g => g.ItemName).HasMaxLength(128).IsRequired();

        builder.HasOne(g => g.Character)
            .WithMany(c => c.Gear)
            .HasForeignKey(g => g.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);

        // ItemId is stored for reference/display but has no FK constraint.
        // Gear syncs from the addon before items may exist in the GameItems table.
        builder.HasIndex(g => g.ItemId);
    }
}
