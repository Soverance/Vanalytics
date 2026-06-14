using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterJobWorkflowConfiguration : IEntityTypeConfiguration<CharacterJobWorkflow>
{
    public void Configure(EntityTypeBuilder<CharacterJobWorkflow> builder)
    {
        builder.HasKey(w => w.Id);

        builder.Property(w => w.Job).HasMaxLength(20).IsRequired();
        builder.Property(w => w.GraphJson)
            .HasColumnType("nvarchar(max)")
            .IsRequired()
            .HasDefaultValue(CharacterJobWorkflow.EmptyGraphJson);

        // One workflow per (character, job) — this constraint IS the "one workflow per job" rule.
        builder.HasIndex(w => new { w.CharacterId, w.Job }).IsUnique();

        builder.HasOne(w => w.Character)
            .WithMany()
            .HasForeignKey(w => w.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
