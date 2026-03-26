using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SessionEventConfiguration : IEntityTypeConfiguration<SessionEvent>
{
    public void Configure(EntityTypeBuilder<SessionEvent> builder)
    {
        builder.HasKey(e => e.Id);

        builder.HasIndex(e => new { e.SessionId, e.EventType });
        builder.HasIndex(e => new { e.SessionId, e.Timestamp });

        builder.Property(e => e.Source).HasMaxLength(64).IsRequired();
        builder.Property(e => e.Target).HasMaxLength(128).IsRequired();
        builder.Property(e => e.Ability).HasMaxLength(128);
        builder.Property(e => e.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(e => e.Session)
            .WithMany(s => s.Events)
            .HasForeignKey(e => e.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
