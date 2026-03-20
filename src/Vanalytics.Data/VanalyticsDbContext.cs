using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;

namespace Vanalytics.Data;

public class VanalyticsDbContext(DbContextOptions<VanalyticsDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterJob> CharacterJobs => Set<CharacterJob>();
    public DbSet<EquippedGear> EquippedGear => Set<EquippedGear>();
    public DbSet<CraftingSkill> CraftingSkills => Set<CraftingSkill>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
    }
}
