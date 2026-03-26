using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterConfiguration : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> builder)
    {
        builder.HasKey(c => c.Id);
        builder.HasIndex(c => new { c.Name, c.Server }).IsUnique();

        builder.Property(c => c.Name).HasMaxLength(64).IsRequired();
        builder.Property(c => c.Server).HasMaxLength(64).IsRequired();
        builder.Property(c => c.SubJob).HasMaxLength(3);
        builder.Property(c => c.Linkshell).HasMaxLength(64);
        builder.Property(c => c.MeritsJson).HasColumnType("nvarchar(max)");
        builder.Property(c => c.FavoriteAnimationJson).HasColumnType("nvarchar(256)");

        builder.HasOne(c => c.User)
            .WithMany()
            .HasForeignKey(c => c.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
