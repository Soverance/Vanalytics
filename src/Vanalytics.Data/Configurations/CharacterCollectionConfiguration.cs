using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterCollectionConfiguration : IEntityTypeConfiguration<CharacterCollection>
{
    public void Configure(EntityTypeBuilder<CharacterCollection> builder)
    {
        builder.HasKey(c => c.CharacterId);

        builder.Property(c => c.SpellIdsJson).HasColumnType("nvarchar(max)");
        builder.Property(c => c.KeyItemIdsJson).HasColumnType("nvarchar(max)");

        builder.HasOne(c => c.Character)
            .WithOne()
            .HasForeignKey<CharacterCollection>(c => c.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
