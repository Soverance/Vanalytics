using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Soverance.Auth.Models;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class AccountDeletionRequestConfiguration : IEntityTypeConfiguration<AccountDeletionRequest>
{
    public void Configure(EntityTypeBuilder<AccountDeletionRequest> builder)
    {
        builder.HasKey(r => r.UserId);
        builder.Property(r => r.UserId).ValueGeneratedNever();

        builder.HasOne<User>()
            .WithOne()
            .HasForeignKey<AccountDeletionRequest>(r => r.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(r => r.LastError).HasMaxLength(2000);
        // Match the Users column sizes these values are moved to/from.
        builder.Property(r => r.ParkedApiKey).HasMaxLength(128);
        builder.Property(r => r.ParkedApiKeyLookup).HasMaxLength(64);

        builder.HasIndex(r => r.ScheduledFor);
    }
}
