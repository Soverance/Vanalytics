using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class NpcPoolConfiguration : IEntityTypeConfiguration<NpcPool>
{
    public void Configure(EntityTypeBuilder<NpcPool> builder)
    {
        builder.HasKey(n => n.Id);
        builder.HasIndex(n => n.PoolId).IsUnique();
        builder.HasIndex(n => n.FamilyId);
        builder.HasIndex(n => n.Name);
        builder.Property(n => n.Name).HasMaxLength(64);
        builder.Property(n => n.PacketName).HasMaxLength(48);
        builder.Property(n => n.ModelData).HasMaxLength(40);
    }
}
