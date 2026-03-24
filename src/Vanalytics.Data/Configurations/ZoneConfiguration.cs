using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ZoneConfiguration : IEntityTypeConfiguration<Zone>
{
    public void Configure(EntityTypeBuilder<Zone> builder)
    {
        builder.HasKey(z => z.Id);
        builder.Property(z => z.Id).ValueGeneratedNever();
        builder.HasIndex(z => z.Name);
        builder.HasIndex(z => z.ModelPath);
        builder.HasIndex(z => z.Expansion);
        builder.Property(z => z.Name).HasMaxLength(128).IsRequired();
        builder.Property(z => z.ModelPath).HasMaxLength(128);
        builder.Property(z => z.DialogPath).HasMaxLength(128);
        builder.Property(z => z.NpcPath).HasMaxLength(128);
        builder.Property(z => z.EventPath).HasMaxLength(128);
        builder.Property(z => z.MapPaths).HasMaxLength(2048);
        builder.Property(z => z.Expansion).HasMaxLength(64);
        builder.Property(z => z.Region).HasMaxLength(128);
    }
}
