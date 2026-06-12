using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class LinkshellProfileConfiguration : IEntityTypeConfiguration<LinkshellProfile>
{
    public void Configure(EntityTypeBuilder<LinkshellProfile> builder)
    {
        builder.HasKey(p => p.Id);
        builder.HasIndex(p => p.LinkshellId).IsUnique();

        builder.Property(p => p.RecruitmentStatus).HasConversion<int>();
        builder.Property(p => p.LogoBlobUrl).HasMaxLength(512);
        builder.Property(p => p.ExternalLinksJson).IsRequired();
        // Description / RecruitmentRules / ExternalLinksJson are nvarchar(max) by
        // default (no HasMaxLength) — they hold rich HTML / JSON.

        builder.HasOne(p => p.Linkshell)
            .WithOne(l => l.Profile)
            .HasForeignKey<LinkshellProfile>(p => p.LinkshellId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
