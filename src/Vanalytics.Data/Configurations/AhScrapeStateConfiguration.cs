using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class AhScrapeStateConfiguration : IEntityTypeConfiguration<AhScrapeState>
{
    public void Configure(EntityTypeBuilder<AhScrapeState> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => new { s.ServerId, s.ItemId, s.Stack }).IsUnique();
        // drives "least-recently-scraped first" ordering
        builder.HasIndex(s => new { s.ServerId, s.LastScrapedAt });

        builder.HasOne(s => s.Server).WithMany().HasForeignKey(s => s.ServerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(s => s.Item).WithMany().HasForeignKey(s => s.ItemId).OnDelete(DeleteBehavior.Cascade);
    }
}
