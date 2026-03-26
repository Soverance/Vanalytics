using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        builder.HasKey(s => s.Id);

        builder.HasIndex(s => new { s.CharacterId, s.Status });
        builder.HasIndex(s => new { s.CharacterId, s.StartedAt });

        builder.Property(s => s.Zone).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Character)
            .WithMany()
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
