using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ServerStatusChangeConfiguration : IEntityTypeConfiguration<ServerStatusChange>
{
    public void Configure(EntityTypeBuilder<ServerStatusChange> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => new { s.GameServerId, s.EndedAt });

        builder.Property(s => s.Status)
            .HasConversion<string>()
            .HasMaxLength(16);

        builder.HasOne(s => s.GameServer)
            .WithMany(g => g.StatusHistory)
            .HasForeignKey(s => s.GameServerId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
