using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class AuctionSaleConfiguration : IEntityTypeConfiguration<AuctionSale>
{
    public void Configure(EntityTypeBuilder<AuctionSale> builder)
    {
        builder.HasKey(s => s.Id);

        builder.HasIndex(s => new { s.ItemId, s.ServerId, s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .IsUnique();

        builder.HasIndex(s => new { s.ItemId, s.ServerId, s.SoldAt });
        builder.HasIndex(s => new { s.ServerId, s.SoldAt });

        builder.Property(s => s.SellerName).HasMaxLength(64).IsRequired();
        builder.Property(s => s.BuyerName).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Item)
            .WithMany()
            .HasForeignKey(s => s.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.Server)
            .WithMany()
            .HasForeignKey(s => s.ServerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.ReportedBy)
            .WithMany()
            .HasForeignKey(s => s.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
