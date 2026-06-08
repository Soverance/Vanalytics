using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class LinkshellConfiguration : IEntityTypeConfiguration<Linkshell>
{
    public void Configure(EntityTypeBuilder<Linkshell> builder)
    {
        builder.HasKey(l => l.Id);
        builder.HasIndex(l => new { l.Server, l.GameLinkshellId }).IsUnique();

        builder.Property(l => l.Server).HasMaxLength(64).IsRequired();
        builder.Property(l => l.Name).HasMaxLength(64).IsRequired();
    }
}
