using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class BazaarPresenceConfiguration : IEntityTypeConfiguration<BazaarPresence>
{
    public void Configure(EntityTypeBuilder<BazaarPresence> builder)
    {
        builder.HasKey(p => p.Id);

        builder.HasIndex(p => new { p.ServerId, p.IsActive, p.Zone });
        builder.HasIndex(p => new { p.PlayerName, p.ServerId });

        builder.Property(p => p.PlayerName).HasMaxLength(64).IsRequired();
        builder.Property(p => p.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(p => p.Server)
            .WithMany()
            .HasForeignKey(p => p.ServerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(p => p.ReportedBy)
            .WithMany()
            .HasForeignKey(p => p.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
