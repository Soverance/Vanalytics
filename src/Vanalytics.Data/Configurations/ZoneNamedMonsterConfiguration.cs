using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ZoneNamedMonsterConfiguration : IEntityTypeConfiguration<ZoneNamedMonster>
{
    public void Configure(EntityTypeBuilder<ZoneNamedMonster> builder)
    {
        builder.HasKey(n => n.Id);
        builder.HasIndex(n => new { n.ZoneId, n.MobName }).IsUnique();
        builder.Property(n => n.MobName).HasMaxLength(64).IsRequired();
        builder.Property(n => n.Genus).HasMaxLength(64);
        builder.Property(n => n.SpawnTypeLabel).HasMaxLength(16).IsRequired();
        builder.Property(n => n.PlaceholderName).HasMaxLength(64);
        builder.Property(n => n.PlaceholderMobIndex).HasMaxLength(8);
        builder.Property(n => n.Notes).HasMaxLength(500);
    }
}
