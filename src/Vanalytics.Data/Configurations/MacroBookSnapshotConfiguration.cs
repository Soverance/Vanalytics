using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroBookSnapshotConfiguration : IEntityTypeConfiguration<MacroBookSnapshot>
{
    public void Configure(EntityTypeBuilder<MacroBookSnapshot> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.ContentHash).HasMaxLength(64).IsRequired();
        builder.Property(s => s.BookTitle).HasMaxLength(16).HasDefaultValue("");
        builder.Property(s => s.SnapshotData).IsRequired();
        builder.Property(s => s.Reason).HasMaxLength(50).IsRequired();
        builder.Property(s => s.CreatedAt).IsRequired();

        builder.HasIndex(s => new { s.MacroBookId, s.CreatedAt });

        builder.HasOne(s => s.MacroBook)
            .WithMany(b => b.Snapshots)
            .HasForeignKey(s => s.MacroBookId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
