using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterGearSetConfiguration : IEntityTypeConfiguration<CharacterGearSet>
{
    public void Configure(EntityTypeBuilder<CharacterGearSet> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.Name).HasMaxLength(100).IsRequired();
        builder.Property(s => s.Job).HasMaxLength(20);
        builder.Property(s => s.SlotsJson).HasColumnType("nvarchar(max)").IsRequired();

        builder.HasIndex(s => s.CharacterId);

        builder.HasOne(s => s.Character)
            .WithMany()
            .HasForeignKey(s => s.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
