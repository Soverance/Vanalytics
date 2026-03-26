using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroBookConfiguration : IEntityTypeConfiguration<MacroBook>
{
    public void Configure(EntityTypeBuilder<MacroBook> builder)
    {
        builder.HasKey(b => b.Id);
        builder.HasIndex(b => new { b.CharacterId, b.BookNumber }).IsUnique();
        builder.Property(b => b.BookNumber).IsRequired();
        builder.Property(b => b.ContentHash).HasMaxLength(64).IsRequired();
        builder.Property(b => b.BookTitle).HasMaxLength(16).HasDefaultValue("");
        builder.Property(b => b.PendingPush).HasDefaultValue(false);
        builder.HasOne(b => b.Character)
            .WithMany(c => c.MacroBooks)
            .HasForeignKey(b => b.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
