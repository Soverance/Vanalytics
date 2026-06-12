using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class LinkshellMembershipConfiguration : IEntityTypeConfiguration<LinkshellMembership>
{
    public void Configure(EntityTypeBuilder<LinkshellMembership> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => new { m.CharacterId, m.LinkshellId }).IsUnique();
        builder.HasIndex(m => m.LinkshellId);

        builder.HasOne(m => m.Character)
            .WithMany()
            .HasForeignKey(m => m.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(m => m.Linkshell)
            .WithMany(l => l.Memberships)
            .HasForeignKey(m => m.LinkshellId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
