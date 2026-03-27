using Microsoft.EntityFrameworkCore;
using Soverance.Data;
using Soverance.Forum.Extensions;
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
    public DbSet<ItemModelMapping> ItemModelMappings => Set<ItemModelMapping>();
    public DbSet<NpcPool> NpcPools => Set<NpcPool>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<ZoneSpawn> ZoneSpawns => Set<ZoneSpawn>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<SessionEvent> SessionEvents => Set<SessionEvent>();
    public DbSet<CharacterInventory> CharacterInventories => Set<CharacterInventory>();
    public DbSet<InventoryChange> InventoryChanges => Set<InventoryChange>();
    public DbSet<MacroBook> MacroBooks => Set<MacroBook>();
    public DbSet<MacroPage> MacroPages => Set<MacroPage>();
    public DbSet<Macro> Macros => Set<Macro>();
    public DbSet<DismissedAnomaly> DismissedAnomalies => Set<DismissedAnomaly>();
    public DbSet<InventoryMoveOrder> InventoryMoveOrders => Set<InventoryMoveOrder>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
        modelBuilder.ApplyForumConfigurations();
    }
}
