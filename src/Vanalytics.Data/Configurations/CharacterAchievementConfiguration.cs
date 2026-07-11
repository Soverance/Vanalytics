using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterAchievementConfiguration : IEntityTypeConfiguration<CharacterAchievement>
{
    public void Configure(EntityTypeBuilder<CharacterAchievement> builder)
    {
        builder.HasKey(a => a.CharacterId);
        builder.Property(a => a.BreakdownJson).HasColumnType("nvarchar(max)");
        builder.HasIndex(a => a.TotalScore);
        builder.HasOne(a => a.Character)
            .WithOne()
            .HasForeignKey<CharacterAchievement>(a => a.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
