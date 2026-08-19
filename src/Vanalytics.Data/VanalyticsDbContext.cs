using Microsoft.EntityFrameworkCore;
using Soverance.Data;
using Soverance.Forum.Extensions;
using Soverance.Messaging.Extensions;
using Vanalytics.Core.Models;

namespace Vanalytics.Data;

public class VanalyticsDbContext(DbContextOptions<VanalyticsDbContext> options)
    : SoveranceDbContextBase(options)
{
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<CharacterJob> CharacterJobs => Set<CharacterJob>();
    public DbSet<EquippedGear> EquippedGear => Set<EquippedGear>();
    public DbSet<CraftingSkill> CraftingSkills => Set<CraftingSkill>();
    public DbSet<CharacterSkill> CharacterSkills => Set<CharacterSkill>();
    public DbSet<GameServer> GameServers => Set<GameServer>();
    public DbSet<GameItem> GameItems => Set<GameItem>();
    public DbSet<ServerStatusChange> ServerStatusChanges => Set<ServerStatusChange>();
    public DbSet<AuctionSale> AuctionSales => Set<AuctionSale>();
    public DbSet<AhScrapeState> AhScrapeStates => Set<AhScrapeState>();
    public DbSet<ScraperSetting> ScraperSettings => Set<ScraperSetting>();
    public DbSet<ScraperRunState> ScraperRunStates => Set<ScraperRunState>();
    public DbSet<AchievementRescoreState> AchievementRescoreStates => Set<AchievementRescoreState>();
    public DbSet<DiscoveredEndpoint> DiscoveredEndpoints => Set<DiscoveredEndpoint>();
    public DbSet<BazaarPresence> BazaarPresences => Set<BazaarPresence>();
    public DbSet<BazaarListing> BazaarListings => Set<BazaarListing>();
    public DbSet<SyncHistory> SyncHistory => Set<SyncHistory>();
    public DbSet<ItemModelMapping> ItemModelMappings => Set<ItemModelMapping>();
    public DbSet<NpcPool> NpcPools => Set<NpcPool>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<ZoneSpawn> ZoneSpawns => Set<ZoneSpawn>();
    public DbSet<ZoneNamedMonster> ZoneNamedMonsters => Set<ZoneNamedMonster>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<SessionEvent> SessionEvents => Set<SessionEvent>();
    public DbSet<CharacterInventory> CharacterInventories => Set<CharacterInventory>();
    public DbSet<InventoryChange> InventoryChanges => Set<InventoryChange>();
    public DbSet<CharacterPorterSlip> CharacterPorterSlips => Set<CharacterPorterSlip>();
    public DbSet<CharacterPorterItem> CharacterPorterItems => Set<CharacterPorterItem>();
    public DbSet<CharacterGearSet> CharacterGearSets => Set<CharacterGearSet>();
    public DbSet<GearSetSlot> GearSetSlots => Set<GearSetSlot>();
    public DbSet<CharacterJobBlueprint> CharacterJobBlueprints => Set<CharacterJobBlueprint>();
    public DbSet<CharacterProgression> CharacterProgression => Set<CharacterProgression>();
    public DbSet<CharacterMissions> CharacterMissions => Set<CharacterMissions>();
    public DbSet<CharacterTitle> CharacterTitles => Set<CharacterTitle>();
    public DbSet<CharacterCollection> CharacterCollection => Set<CharacterCollection>();
    public DbSet<MacroBook> MacroBooks => Set<MacroBook>();
    public DbSet<MacroBookSnapshot> MacroBookSnapshots => Set<MacroBookSnapshot>();
    public DbSet<MacroPage> MacroPages => Set<MacroPage>();
    public DbSet<Macro> Macros => Set<Macro>();
    public DbSet<DismissedAnomaly> DismissedAnomalies => Set<DismissedAnomaly>();
    public DbSet<InventoryMoveOrder> InventoryMoveOrders => Set<InventoryMoveOrder>();
    public DbSet<SynthRecipe> SynthRecipes => Set<SynthRecipe>();
    public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
    public DbSet<Linkshell> Linkshells => Set<Linkshell>();
    public DbSet<LinkshellMembership> LinkshellMemberships => Set<LinkshellMembership>();
    public DbSet<LinkshellProfile> LinkshellProfiles => Set<LinkshellProfile>();
    public DbSet<LinkshellApplication> LinkshellApplications => Set<LinkshellApplication>();
    public DbSet<CharacterAchievement> CharacterAchievements => Set<CharacterAchievement>();
    public DbSet<LinkshellAchievement> LinkshellAchievements => Set<LinkshellAchievement>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VanalyticsDbContext).Assembly);
        modelBuilder.ApplyForumConfigurations();
        modelBuilder.ApplyMessagingConfigurations();
    }
}
