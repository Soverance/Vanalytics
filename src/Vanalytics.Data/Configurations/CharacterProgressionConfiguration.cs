using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterProgressionConfiguration : IEntityTypeConfiguration<CharacterProgression>
{
    public void Configure(EntityTypeBuilder<CharacterProgression> builder)
    {
        builder.HasKey(p => p.CharacterId);

        builder.Property(p => p.WarpsJson).HasColumnType("nvarchar(max)");
        builder.Property(p => p.JobPointsJson).HasColumnType("nvarchar(max)");

        builder.HasOne(p => p.Character)
            .WithOne()
            .HasForeignKey<CharacterProgression>(p => p.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
