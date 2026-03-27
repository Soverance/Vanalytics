using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ZoneSpawnConfiguration : IEntityTypeConfiguration<ZoneSpawn>
{
    public void Configure(EntityTypeBuilder<ZoneSpawn> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => s.ZoneId);
        builder.HasIndex(s => s.PoolId);
        builder.Property(s => s.MobName).HasMaxLength(64).IsRequired();
    }
}
