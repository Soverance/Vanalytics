using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterTitleConfiguration : IEntityTypeConfiguration<CharacterTitle>
{
    public void Configure(EntityTypeBuilder<CharacterTitle> builder)
    {
        // Composite key — one row per (character, title) pair.
        builder.HasKey(t => new { t.CharacterId, t.TitleId });

        builder.HasOne(t => t.Character)
            .WithMany()
            .HasForeignKey(t => t.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
