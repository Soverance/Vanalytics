using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroConfiguration : IEntityTypeConfiguration<Macro>
{
    public void Configure(EntityTypeBuilder<Macro> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => new { m.MacroPageId, m.Set, m.Position }).IsUnique();
        builder.Property(m => m.Set).HasMaxLength(4).IsRequired();
        builder.Property(m => m.Position).IsRequired();
        builder.Property(m => m.Name).HasMaxLength(8);
        builder.Property(m => m.Line1).HasMaxLength(61);
        builder.Property(m => m.Line2).HasMaxLength(61);
        builder.Property(m => m.Line3).HasMaxLength(61);
        builder.Property(m => m.Line4).HasMaxLength(61);
        builder.Property(m => m.Line5).HasMaxLength(61);
        builder.Property(m => m.Line6).HasMaxLength(61);
        builder.HasOne(m => m.Page)
            .WithMany(p => p.Macros)
            .HasForeignKey(m => m.MacroPageId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
