using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SyncHistoryConfiguration : IEntityTypeConfiguration<SyncHistory>
{
    public void Configure(EntityTypeBuilder<SyncHistory> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.ProviderId).IsRequired().HasMaxLength(64);
        builder.Property(s => s.Status).IsRequired().HasMaxLength(32);
        builder.Property(s => s.ErrorMessage).HasMaxLength(2000);
        builder.HasIndex(s => new { s.ProviderId, s.StartedAt });
    }
}
