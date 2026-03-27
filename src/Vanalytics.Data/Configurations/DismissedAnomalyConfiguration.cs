using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class DismissedAnomalyConfiguration : IEntityTypeConfiguration<DismissedAnomaly>
{
    public void Configure(EntityTypeBuilder<DismissedAnomaly> builder)
    {
        builder.HasKey(d => d.Id);

        builder.HasIndex(d => new { d.CharacterId, d.AnomalyKey }).IsUnique();

        builder.Property(d => d.AnomalyKey).HasMaxLength(128).IsRequired();

        builder.HasOne(d => d.Character)
            .WithMany()
            .HasForeignKey(d => d.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
