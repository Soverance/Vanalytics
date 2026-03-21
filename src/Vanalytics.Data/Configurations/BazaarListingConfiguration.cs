using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class BazaarListingConfiguration : IEntityTypeConfiguration<BazaarListing>
{
    public void Configure(EntityTypeBuilder<BazaarListing> builder)
    {
        builder.HasKey(l => l.Id);

        builder.HasIndex(l => new { l.ItemId, l.ServerId, l.IsActive });
        builder.HasIndex(l => new { l.SellerName, l.ServerId, l.IsActive });

        builder.Property(l => l.SellerName).HasMaxLength(64).IsRequired();
        builder.Property(l => l.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(l => l.Item)
            .WithMany()
            .HasForeignKey(l => l.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(l => l.Server)
            .WithMany()
            .HasForeignKey(l => l.ServerId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(l => l.ReportedBy)
            .WithMany()
            .HasForeignKey(l => l.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
