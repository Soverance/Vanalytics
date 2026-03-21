using Microsoft.EntityFrameworkCore;
using Soverance.Data;
using Vanalytics.Core.Models;

namespace Vanalytics.Data;

public class VanalyticsDbContext(DbContextOptions<VanalyticsDbContext> options)
    : SoveranceDbContextBase(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterJob> CharacterJobs => Set<CharacterJob>();
    public DbSet<EquippedGear> EquippedGear => Set<EquippedGear>();
    public DbSet<CraftingSkill> CraftingSkills => Set<CraftingSkill>();
    public DbSet<GameServer> GameServers => Set<GameServer>();
    public DbSet<GameItem> GameItems => Set<GameItem>();
    public DbSet<ServerStatusChange> ServerStatusChanges => Set<ServerStatusChange>();
    public DbSet<AuctionSale> AuctionSales => Set<AuctionSale>();
    public DbSet<BazaarPresence> BazaarPresences => Set<BazaarPresence>();
    public DbSet<BazaarListing> BazaarListings => Set<BazaarListing>();
    public DbSet<SyncHistory> SyncHistory => Set<SyncHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
    }
}
