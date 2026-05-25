using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterPorterItemConfiguration : IEntityTypeConfiguration<CharacterPorterItem>
{
    public void Configure(EntityTypeBuilder<CharacterPorterItem> builder)
    {
        builder.HasKey(p => p.Id);

        builder.HasIndex(p => new { p.CharacterId, p.SlipItemId, p.ItemId }).IsUnique();
        builder.HasIndex(p => p.CharacterId);

        builder.HasOne(p => p.Character)
            .WithMany()
            .HasForeignKey(p => p.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
