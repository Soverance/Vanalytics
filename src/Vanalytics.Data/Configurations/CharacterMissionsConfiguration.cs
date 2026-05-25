using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterMissionsConfiguration : IEntityTypeConfiguration<CharacterMissions>
{
    public void Configure(EntityTypeBuilder<CharacterMissions> builder)
    {
        builder.HasKey(m => m.CharacterId);

        builder.Property(m => m.MissionsJson).HasColumnType("nvarchar(max)");

        builder.HasOne(m => m.Character)
            .WithOne()
            .HasForeignKey<CharacterMissions>(m => m.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
