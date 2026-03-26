using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class MacroPageConfiguration : IEntityTypeConfiguration<MacroPage>
{
    public void Configure(EntityTypeBuilder<MacroPage> builder)
    {
        builder.HasKey(p => p.Id);
        builder.HasIndex(p => new { p.MacroBookId, p.PageNumber }).IsUnique();
        builder.Property(p => p.PageNumber).IsRequired();
        builder.HasOne(p => p.Book)
            .WithMany(b => b.Pages)
            .HasForeignKey(p => p.MacroBookId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
