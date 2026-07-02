using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ScraperSettingConfiguration : IEntityTypeConfiguration<ScraperSetting>
{
    public void Configure(EntityTypeBuilder<ScraperSetting> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).ValueGeneratedNever();
    }
}
