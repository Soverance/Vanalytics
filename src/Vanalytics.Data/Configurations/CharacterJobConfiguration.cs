using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterJobConfiguration : IEntityTypeConfiguration<CharacterJob>
{
    public void Configure(EntityTypeBuilder<CharacterJob> builder)
    {
        builder.HasKey(j => j.Id);
        builder.HasIndex(j => new { j.CharacterId, j.JobId }).IsUnique();

        builder.Property(j => j.JobId)
            .HasConversion<string>()
            .HasMaxLength(3);

        builder.HasOne(j => j.Character)
            .WithMany(c => c.Jobs)
            .HasForeignKey(j => j.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
