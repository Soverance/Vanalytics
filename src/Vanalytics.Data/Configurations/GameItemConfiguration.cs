using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class GameItemConfiguration : IEntityTypeConfiguration<GameItem>
{
    public void Configure(EntityTypeBuilder<GameItem> builder)
    {
        builder.HasKey(i => i.ItemId);
        builder.Property(i => i.ItemId).ValueGeneratedNever();
        builder.HasIndex(i => i.Name);
        builder.HasIndex(i => i.Category);
        builder.HasIndex(i => i.Level);
        builder.Property(i => i.Name).HasMaxLength(128).IsRequired();
        builder.Property(i => i.NameJa).HasMaxLength(128);
        builder.Property(i => i.NameLong).HasMaxLength(256);
        builder.Property(i => i.Description).HasMaxLength(4096);
        builder.Property(i => i.DescriptionJa).HasMaxLength(4096);
        builder.Property(i => i.Category).HasMaxLength(32).IsRequired();
        builder.Property(i => i.SubCategory).HasMaxLength(32);
        builder.HasIndex(i => i.SubCategory);
        builder.Property(i => i.IconPath).HasMaxLength(256);
        builder.Property(i => i.PreviewImagePath).HasMaxLength(256);
        builder.Ignore(i => i.IsRare);
        builder.Ignore(i => i.IsExclusive);
        builder.Ignore(i => i.IsNoAuction);
        builder.Ignore(i => i.IsNoSale);
        builder.Ignore(i => i.IsInscribable);
    }
}
