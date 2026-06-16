using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterJobBlueprintConfiguration : IEntityTypeConfiguration<CharacterJobBlueprint>
{
    public void Configure(EntityTypeBuilder<CharacterJobBlueprint> builder)
    {
        builder.HasKey(w => w.Id);

        builder.Property(w => w.Job).HasMaxLength(20).IsRequired();
        builder.Property(w => w.GraphJson)
            .HasColumnType("nvarchar(max)")
            .IsRequired()
            .HasDefaultValue(CharacterJobBlueprint.EmptyGraphJson);

        // One blueprint per (character, job) — this constraint IS the "one blueprint per job" rule.
        builder.HasIndex(w => new { w.CharacterId, w.Job }).IsUnique();

        builder.HasOne(w => w.Character)
            .WithMany()
            .HasForeignKey(w => w.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
