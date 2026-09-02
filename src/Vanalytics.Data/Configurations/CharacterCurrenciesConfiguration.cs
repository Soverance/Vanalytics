using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class CharacterCurrenciesConfiguration : IEntityTypeConfiguration<CharacterCurrencies>
{
    public void Configure(EntityTypeBuilder<CharacterCurrencies> builder)
    {
        builder.HasKey(c => c.CharacterId);

        builder.Property(c => c.CurrenciesJson).HasColumnType("nvarchar(max)");

        builder.HasOne(c => c.Character)
            .WithOne()
            .HasForeignKey<CharacterCurrencies>(c => c.CharacterId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
