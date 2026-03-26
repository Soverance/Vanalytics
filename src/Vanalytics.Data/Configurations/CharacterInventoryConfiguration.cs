using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterInventoryConfiguration : IEntityTypeConfiguration<CharacterInventory>
{
    public void Configure(EntityTypeBuilder<CharacterInventory> builder)
    {
        builder.HasKey(i => i.Id);

        builder.HasIndex(i => new { i.CharacterId, i.ItemId, i.Bag, i.SlotIndex }).IsUnique();

        builder.HasOne(i => i.Character)
            .WithMany()
            .HasForeignKey(i => i.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
