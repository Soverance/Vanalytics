using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterGearSetConfiguration : IEntityTypeConfiguration<CharacterGearSet>
{
    public void Configure(EntityTypeBuilder<CharacterGearSet> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.Name).HasMaxLength(100).IsRequired();
        builder.Property(s => s.Job).HasMaxLength(20);
        builder.Property(s => s.Category).HasMaxLength(20).IsRequired().HasDefaultValue("Other");
        builder.Property(s => s.TagsJson).HasColumnType("nvarchar(max)").IsRequired().HasDefaultValue("[]");

        builder.HasIndex(s => s.CharacterId);
        builder.HasIndex(s => new { s.CharacterId, s.Job, s.Category });

        builder.HasOne(s => s.Character)
            .WithMany()
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
