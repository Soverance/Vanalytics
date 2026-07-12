using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class LinkshellAchievementConfiguration : IEntityTypeConfiguration<LinkshellAchievement>
{
    public void Configure(EntityTypeBuilder<LinkshellAchievement> builder)
    {
        builder.HasKey(a => a.LinkshellId);
        builder.HasIndex(a => a.TotalScore);
        builder.HasIndex(a => a.AverageScore);
        builder.HasOne(a => a.Linkshell)
            .WithOne()
            .HasForeignKey<LinkshellAchievement>(a => a.LinkshellId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
