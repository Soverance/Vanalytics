using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class DiscoveredEndpointConfiguration : IEntityTypeConfiguration<DiscoveredEndpoint>
{
    public void Configure(EntityTypeBuilder<DiscoveredEndpoint> builder)
    {
        builder.HasKey(e => e.Id);
        builder.HasIndex(e => new { e.Ip, e.Port }).IsUnique();
        builder.Property(e => e.Ip).HasMaxLength(45).IsRequired();   // IPv4/IPv6 max
        builder.HasOne(e => e.MappedServer)
            .WithMany()
            .HasForeignKey(e => e.MappedServerId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
