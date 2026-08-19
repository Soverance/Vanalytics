using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class AchievementRescoreStateConfiguration : IEntityTypeConfiguration<AchievementRescoreState>
{
    public void Configure(EntityTypeBuilder<AchievementRescoreState> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).ValueGeneratedNever();
        builder.Property(s => s.LastError).HasMaxLength(2000);
    }
}
