using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CraftingSkillConfiguration : IEntityTypeConfiguration<CraftingSkill>
{
    public void Configure(EntityTypeBuilder<CraftingSkill> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => new { s.CharacterId, s.Craft }).IsUnique();

        builder.Property(s => s.Craft)
            .HasConversion<string>()
            .HasMaxLength(32);
        builder.Property(s => s.Rank).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Character)
            .WithMany(c => c.CraftingSkills)
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
