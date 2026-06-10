using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class LinkshellApplicationConfiguration : IEntityTypeConfiguration<LinkshellApplication>
{
    public void Configure(EntityTypeBuilder<LinkshellApplication> builder)
    {
        builder.HasKey(a => a.Id);

        // Drives both the cooldown lookup (LS + applicant + recency) and the
        // ApplyState "most recent application" probe.
        builder.HasIndex(a => new { a.LinkshellId, a.ApplicantUserId, a.CreatedAt });

        // FK to Linkshell only, with cascade. CharacterId / ApplicantUserId are
        // left as plain columns (no FK) on purpose: a second cascade path from
        // Character would trip SQL Server's multiple-cascade-paths restriction,
        // and these rows are harmless historical records if their character/user
        // is later removed.
        // No inverse collection on Linkshell — applications are queried directly,
        // never loaded via the parent.
        builder.HasOne(a => a.Linkshell)
            .WithMany()
            .HasForeignKey(a => a.LinkshellId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
