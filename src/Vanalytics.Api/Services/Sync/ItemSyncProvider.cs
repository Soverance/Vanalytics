using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class ItemSyncProvider : ISyncProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ItemSyncProvider> _logger;

    private const string ItemsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/items.lua";
    private const string DescriptionsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/item_descriptions.lua";
    private const string ModelMappingsUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_equipment.sql";
    private const string MobPoolsUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_pools.sql";
    private const string ItemBasicUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_basic.sql";
    private const string SynthRecipesUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/synth_recipes.sql";
    private const int BatchSize = 1000;

    public string ProviderId => "items";
    public string DisplayName => "Game Data";

    public ItemSyncProvider(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ItemSyncProvider> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        SyncProgressEvent Phase1(string message, int current = 0, int total = 0, int a = 0, int u = 0, SyncEventType type = SyncEventType.Progress) => new()
        {
            ProviderId = ProviderId,
            Type = type,
            Phase = 1, PhaseTotal = 5, PhaseLabel = "Items",
            Message = message,
            Current = current, Total = total,
            Added = a, Updated = u,
        };

        progress.Report(Phase1("[Phase 1/5 — Items] Downloading item data from Windower Resources...", type: SyncEventType.Started));

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        progress.Report(Phase1("[Phase 1/5 — Items] Parsing item data..."));

        var items = Services.LuaResourceParser.ParseItems(itemsLua);
        var descriptions = Services.LuaResourceParser.ParseDescriptions(descriptionsLua);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            if (descriptions.TryGetValue(item.ItemId, out var desc))
            {
                item.Description = desc.En;
                item.DescriptionJa = desc.Ja;
                Services.ItemStatExtractor.ExtractStats(item, desc.En);
            }
            item.UpdatedAt = now;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Database.SetCommandTimeout(TimeSpan.FromMinutes(10));

        // Load existing items with a hash of their mutable fields for change detection.
        // This avoids loading full entities and tracking 30k+ objects.
        var existingHashes = await db.GameItems
            .AsNoTracking()
            .Select(i => new { i.ItemId, i.Name, i.Category, i.SubCategory, i.Type, i.Flags, i.StackSize,
                i.Level, i.Jobs, i.Races, i.Slots, i.Skill, i.ItemLevel,
                i.Damage, i.Delay, i.DEF, i.HP, i.MP,
                i.STR, i.DEX, i.VIT, i.AGI, i.INT, i.MND, i.CHR,
                i.Accuracy, i.Attack, i.RangedAccuracy, i.RangedAttack,
                i.MagicAccuracy, i.MagicDamage, i.MagicEvasion, i.Evasion,
                i.Enmity, i.Haste, i.StoreTP, i.TPBonus,
                i.PhysicalDamageTaken, i.MagicDamageTaken,
                i.Description, i.DescriptionJa })
            .ToDictionaryAsync(
                i => i.ItemId,
                i => ComputeHash(i.Name, i.Category, i.SubCategory, i.Type, i.Flags, i.StackSize,
                    i.Level, i.Jobs, i.Races, i.Slots, i.Skill, i.ItemLevel,
                    i.Damage, i.Delay, i.DEF, i.HP, i.MP,
                    i.STR, i.DEX, i.VIT, i.AGI, i.INT, i.MND, i.CHR,
                    i.Accuracy, i.Attack, i.RangedAccuracy, i.RangedAttack,
                    i.MagicAccuracy, i.MagicDamage, i.MagicEvasion, i.Evasion,
                    i.Enmity, i.Haste, i.StoreTP, i.TPBonus,
                    i.PhysicalDamageTaken, i.MagicDamageTaken,
                    i.Description, i.DescriptionJa),
                ct);

        var newItems = items.Where(i => !existingHashes.ContainsKey(i.ItemId)).ToList();
        var changedItems = items.Where(i =>
            existingHashes.TryGetValue(i.ItemId, out var hash) && hash != ComputeItemHash(i)
        ).ToList();

        var total = items.Count;
        var added = 0;
        var updated = 0;
        var skipped = total - newItems.Count - changedItems.Count;

        progress.Report(Phase1(
            $"[Phase 1/5 — Items] Found {newItems.Count} new, {changedItems.Count} changed, {skipped} unchanged items.",
            total: total));

        // Insert new items in batches
        if (newItems.Count > 0)
        {
            foreach (var item in newItems)
                item.CreatedAt = now;

            for (var batchStart = 0; batchStart < newItems.Count; batchStart += BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = newItems.Skip(batchStart).Take(BatchSize).ToList();
                db.GameItems.AddRange(batch);
                await db.SaveChangesAsync(ct);
                // Detach to prevent change tracker bloat
                foreach (var entry in db.ChangeTracker.Entries().ToList())
                    entry.State = EntityState.Detached;

                added += batch.Count;

                progress.Report(Phase1(
                    $"[Phase 1/5 — Items] Inserted {added} of {newItems.Count} new items...",
                    current: added, total: total, a: added, u: updated));
            }

            _logger.LogInformation("Added {Count} new items", added);
        }

        // Update only changed items. Old path issued one ExecuteUpdateAsync per
        // row (~30k round-trips on a schema bump). New path: bulk-copy the
        // changed rows into a #temp table, then a single UPDATE..FROM JOIN.
        if (changedItems.Count > 0)
        {
            foreach (var item in changedItems)
                item.UpdatedAt = now;

            progress.Report(Phase1(
                $"[Phase 1/5 — Items] Staging {changedItems.Count} changed items for bulk update...",
                current: added, total: total, a: added, u: updated));

            await BulkUpdateChangedItemsAsync(db, changedItems, progress, Phase1, added, total, ct);
            updated = changedItems.Count;

            progress.Report(Phase1(
                $"[Phase 1/5 — Items] Applied {updated} updates via bulk merge.",
                current: added + updated, total: total, a: added, u: updated));

            _logger.LogInformation("Updated {Count} changed items (skipped {Skipped} unchanged)", updated, skipped);
        }

        _logger.LogInformation("Item sync complete: {Total} items ({Added} added, {Updated} updated, {Skipped} unchanged)",
            total, added, updated, skipped);

        // Phase 2: Sync model mappings from LandSandBoat
        await SyncModelMappingsAsync(db, client, progress, added, updated, total, ct);

        // Phase 3: Sync NPC/Monster pool data from LandSandBoat
        await SyncNpcPoolsAsync(db, client, progress, ct);

        // Phase 4: Sync NPC sell prices from LandSandBoat
        await SyncBaseSellAsync(db, client, progress, ct);

        // Phase 5: Sync crafting recipes from LandSandBoat
        await SyncRecipesAsync(db, client, progress, ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Phase = 5, PhaseTotal = 5,
            Message = $"Sync complete: {added} added, {updated} updated, {skipped} unchanged. Model mappings, NPC pools, sell prices, and crafting recipes updated.",
            Current = total,
            Total = total,
            Added = added,
            Updated = updated
        });
    }

    /// <summary>
    /// FFXI equipment slot bitmask → model viewer slot ID.
    /// Only visual equipment slots are mapped (no ammo, earrings, rings, etc.)
    /// </summary>
    private static readonly Dictionary<int, int> SlotBitmaskToModelSlot = new()
    {
        [1] = 7,     // Main hand
        [2] = 8,     // Sub hand (weapons + shields)
        [3] = 7,     // Main+Sub → use main
        [4] = 9,     // Range
        [16] = 2,    // Head
        [32] = 3,    // Body
        [64] = 4,    // Hands
        [128] = 5,   // Legs
        [256] = 6,   // Feet
    };

    /// <summary>
    /// Sync item model mappings from LandSandBoat's item_equipment.sql.
    /// This provides the authoritative item → visual model ID mapping for the 3D model viewer.
    /// </summary>
    private async Task SyncModelMappingsAsync(
        VanalyticsDbContext db, HttpClient client,
        IProgress<SyncProgressEvent> progress,
        int itemsAdded, int itemsUpdated, int itemsTotal,
        CancellationToken ct)
    {
        SyncProgressEvent Phase2(string message, int current = 0, int total = 0) => new()
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Phase = 2, PhaseTotal = 5, PhaseLabel = "Model Mappings",
            Message = message,
            Current = current, Total = total,
        };

        progress.Report(Phase2(
            "[Phase 2/5 — Model Mappings] Downloading from LandSandBoat...",
            current: itemsAdded + itemsUpdated, total: itemsTotal));

        string sql;
        try
        {
            sql = await client.GetStringAsync(ModelMappingsUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download model mappings — skipping");
            return;
        }

        // Parse INSERT statements: (itemId,'name',level,ilevel,jobs,MId,shieldSize,scriptType,slot,rslot,rslotlook,su_level)
        var parsed = new List<(int ItemId, int ModelId, int Slot)>();
        var regex = new System.Text.RegularExpressions.Regex(
            @"\((\d+),'[^']*',\d+,\d+,\d+,(\d+),\d+,\d+,(\d+),\d+,\d+,\d+\)");

        foreach (System.Text.RegularExpressions.Match match in regex.Matches(sql))
        {
            var itemId = int.Parse(match.Groups[1].Value);
            var modelId = int.Parse(match.Groups[2].Value);
            var slot = int.Parse(match.Groups[3].Value);

            if (modelId <= 0) continue;
            if (!SlotBitmaskToModelSlot.TryGetValue(slot, out var modelSlotId)) continue;

            parsed.Add((itemId, modelId, modelSlotId));

            // Slot bitmask 3 = Main+Sub (dual-wieldable weapons).
            // Add a Sub slot entry too so the model viewer renders sub-hand weapons.
            if (slot == 3)
            {
                parsed.Add((itemId, modelId, 8));
            }
        }

        progress.Report(Phase2($"[Phase 2/5 — Model Mappings] Parsed {parsed.Count} entries. Updating database..."));

        // Load existing mappings for comparison
        var existing = await db.ItemModelMappings
            .AsNoTracking()
            .ToDictionaryAsync(m => (m.ItemId, m.SlotId), m => m, ct);

        var now = DateTimeOffset.UtcNow;
        var modelAdded = 0;
        var modelUpdated = 0;
        var modelSkipped = 0;

        foreach (var (itemId, modelId, slotId) in parsed)
        {
            ct.ThrowIfCancellationRequested();

            if (existing.TryGetValue((itemId, slotId), out var ex))
            {
                if (ex.ModelId == modelId)
                {
                    modelSkipped++;
                    continue;
                }
                // Model ID changed — update
                await db.ItemModelMappings
                    .Where(m => m.ItemId == itemId && m.SlotId == slotId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(m => m.ModelId, modelId)
                        .SetProperty(m => m.Source, ModelMappingSource.Static)
                        .SetProperty(m => m.UpdatedAt, now), ct);
                modelUpdated++;
            }
            else
            {
                // New mapping
                db.ItemModelMappings.Add(new ItemModelMapping
                {
                    ItemId = itemId,
                    SlotId = slotId,
                    ModelId = modelId,
                    Source = ModelMappingSource.Static,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
                modelAdded++;

                // Batch save to avoid tracking bloat
                if (modelAdded % BatchSize == 0)
                {
                    await db.SaveChangesAsync(ct);
                    foreach (var entry in db.ChangeTracker.Entries().ToList())
                        entry.State = EntityState.Detached;
                }
            }
        }

        // Final save
        await db.SaveChangesAsync(ct);
        foreach (var entry in db.ChangeTracker.Entries().ToList())
            entry.State = EntityState.Detached;

        _logger.LogInformation("Model mapping sync: {Added} added, {Updated} updated, {Skipped} unchanged",
            modelAdded, modelUpdated, modelSkipped);

        progress.Report(Phase2($"[Phase 2/5 — Model Mappings] {modelAdded} added, {modelUpdated} updated, {modelSkipped} unchanged."));
    }

    /// <summary>
    /// Sync NPC/Monster pool data from LandSandBoat's mob_pools.sql.
    /// The modelid field is binary(20) = 10 uint16 slots:
    /// [0]=race, [1]=face/modelId, [2]=head, [3]=body, [4]=hands, [5]=legs, [6]=feet, [7]=main, [8]=sub, [9]=ranged
    /// For monsters (race=0), slot[1] is the visual model identifier.
    /// </summary>
    private async Task SyncNpcPoolsAsync(
        VanalyticsDbContext db, HttpClient client,
        IProgress<SyncProgressEvent> progress,
        CancellationToken ct)
    {
        SyncProgressEvent Phase3(string message) => new()
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Phase = 3, PhaseTotal = 5, PhaseLabel = "NPC Pools",
            Message = message,
        };

        progress.Report(Phase3("[Phase 3/5 — NPC Pools] Downloading mob pool data from LandSandBoat..."));

        string sql;
        try
        {
            sql = await client.GetStringAsync(MobPoolsUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download mob pools — skipping");
            progress.Report(Phase3("[Phase 3/5 — NPC Pools] Download failed — skipped."));
            return;
        }

        // Parse INSERT statements from mob_pools.sql
        // Format: (poolid,'name','packet_name',familyid,0xMODELID_HEX,...)
        var parsed = new List<NpcPool>();
        var regex = new System.Text.RegularExpressions.Regex(
            @"\((\d+),'([^']*)','([^']*)',(\d+),(0x[0-9A-Fa-f]{40}),");

        foreach (System.Text.RegularExpressions.Match match in regex.Matches(sql))
        {
            var poolId = int.Parse(match.Groups[1].Value);
            var name = match.Groups[2].Value.Replace('_', ' ');
            var packetName = match.Groups[3].Value;
            var familyId = int.Parse(match.Groups[4].Value);
            var modelHex = match.Groups[5].Value[2..]; // strip "0x"

            // Parse first two uint16 values from the 40-char hex string (little-endian)
            var raceSlot = ParseUint16LE(modelHex, 0);
            var modelSlot = ParseUint16LE(modelHex, 1);
            var isMonster = raceSlot == 0;

            parsed.Add(new NpcPool
            {
                PoolId = poolId,
                Name = name,
                PacketName = packetName,
                FamilyId = familyId,
                ModelId = isMonster ? modelSlot : raceSlot,
                IsMonster = isMonster,
                ModelData = modelHex,
            });
        }

        progress.Report(Phase3($"[Phase 3/5 — NPC Pools] Parsed {parsed.Count} NPC pools. Updating database..."));

        // Load existing pools for comparison
        var existing = await db.NpcPools
            .AsNoTracking()
            .ToDictionaryAsync(n => n.PoolId, n => n, ct);

        var now = DateTimeOffset.UtcNow;
        var npcAdded = 0;
        var npcUpdated = 0;
        var npcSkipped = 0;

        foreach (var npc in parsed)
        {
            ct.ThrowIfCancellationRequested();

            if (existing.TryGetValue(npc.PoolId, out var ex))
            {
                // Check if anything changed
                if (ex.Name == npc.Name && ex.FamilyId == npc.FamilyId &&
                    ex.ModelId == npc.ModelId && ex.ModelData == npc.ModelData)
                {
                    npcSkipped++;
                    continue;
                }

                await db.NpcPools
                    .Where(n => n.PoolId == npc.PoolId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(n => n.Name, npc.Name)
                        .SetProperty(n => n.PacketName, npc.PacketName)
                        .SetProperty(n => n.FamilyId, npc.FamilyId)
                        .SetProperty(n => n.ModelId, npc.ModelId)
                        .SetProperty(n => n.IsMonster, npc.IsMonster)
                        .SetProperty(n => n.ModelData, npc.ModelData)
                        .SetProperty(n => n.UpdatedAt, now), ct);
                npcUpdated++;
            }
            else
            {
                npc.CreatedAt = now;
                npc.UpdatedAt = now;
                db.NpcPools.Add(npc);
                npcAdded++;

                if (npcAdded % BatchSize == 0)
                {
                    await db.SaveChangesAsync(ct);
                    foreach (var entry in db.ChangeTracker.Entries().ToList())
                        entry.State = EntityState.Detached;

                    progress.Report(Phase3($"[Phase 3/5 — NPC Pools] Inserted {npcAdded} pools so far..."));
                }
            }
        }

        await db.SaveChangesAsync(ct);
        foreach (var entry in db.ChangeTracker.Entries().ToList())
            entry.State = EntityState.Detached;

        _logger.LogInformation("NPC pool sync: {Added} added, {Updated} updated, {Skipped} unchanged",
            npcAdded, npcUpdated, npcSkipped);

        progress.Report(Phase3($"[Phase 3/5 — NPC Pools] {npcAdded} added, {npcUpdated} updated, {npcSkipped} unchanged."));
    }

    /// <summary>
    /// Sync NPC vendor buyback prices from LandSandBoat's item_basic.sql.
    /// Parses BaseSell (column 9) from INSERT statements and updates only changed records.
    /// </summary>
    private async Task SyncBaseSellAsync(
        VanalyticsDbContext db, HttpClient client,
        IProgress<SyncProgressEvent> progress,
        CancellationToken ct)
    {
        SyncProgressEvent Phase4(string message) => new()
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Phase = 4, PhaseTotal = 5, PhaseLabel = "Sell Prices",
            Message = message,
        };

        progress.Report(Phase4("[Phase 4/5 — Sell Prices] Downloading item_basic.sql from LandSandBoat..."));

        string sql;
        try
        {
            sql = await client.GetStringAsync(ItemBasicUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download item_basic.sql — skipping BaseSell sync");
            progress.Report(Phase4("[Phase 4/5 — Sell Prices] Download failed — skipped."));
            return;
        }

        // Parse INSERT statements:
        // (itemId,subid,'name','sortname',type,stackSize,flags,aH,BaseSell,...)
        // Note: 'type' column can be @VARIABLE (e.g., @FURNISHING_TYPE) or numeric
        var parsed = new Dictionary<int, int>();
        var regex = new System.Text.RegularExpressions.Regex(
            @"\((\d+),\d+,'[^']*','[^']*',(?:@\w+|\d+),\d+,\d+,(?:@\w+|\d+),(\d+)");

        foreach (System.Text.RegularExpressions.Match match in regex.Matches(sql))
        {
            var itemId = int.Parse(match.Groups[1].Value);
            var baseSell = int.Parse(match.Groups[2].Value);
            parsed[itemId] = baseSell;
        }

        progress.Report(Phase4($"[Phase 4/5 — Sell Prices] Parsed {parsed.Count} entries. Checking for changes..."));

        // Load existing BaseSell values for change detection
        var existing = await db.GameItems
            .AsNoTracking()
            .Where(i => parsed.Keys.Contains(i.ItemId))
            .Select(i => new { i.ItemId, i.BaseSell })
            .ToDictionaryAsync(i => i.ItemId, i => i.BaseSell, ct);

        var now = DateTimeOffset.UtcNow;
        var sellUpdated = 0;
        var sellSkipped = 0;

        foreach (var (itemId, baseSell) in parsed)
        {
            ct.ThrowIfCancellationRequested();

            if (!existing.TryGetValue(itemId, out var current))
                continue; // Item doesn't exist in our DB yet — skip

            if (current == baseSell)
            {
                sellSkipped++;
                continue;
            }

            await db.GameItems
                .Where(i => i.ItemId == itemId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(i => i.BaseSell, baseSell)
                    .SetProperty(i => i.UpdatedAt, now), ct);

            sellUpdated++;
        }

        _logger.LogInformation("BaseSell sync: {Updated} updated, {Skipped} unchanged", sellUpdated, sellSkipped);

        progress.Report(Phase4($"[Phase 4/5 — Sell Prices] {sellUpdated} updated, {sellSkipped} unchanged."));
    }

    /// <summary>
    /// Sync crafting recipes from LandSandBoat's synth_recipes.sql.
    /// Uses a clear-and-reinsert strategy: deletes all existing recipes and ingredients
    /// then inserts fresh data, since recipes change infrequently.
    /// </summary>
    private async Task SyncRecipesAsync(
        VanalyticsDbContext db, HttpClient client,
        IProgress<SyncProgressEvent> progress,
        CancellationToken ct)
    {
        SyncProgressEvent Phase5(string message) => new()
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Phase = 5, PhaseTotal = 5, PhaseLabel = "Crafting Recipes",
            Message = message,
        };

        progress.Report(Phase5("[Phase 5/5 — Crafting Recipes] Downloading synth_recipes.sql from LandSandBoat..."));

        string sql;
        try
        {
            sql = await client.GetStringAsync(SynthRecipesUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download synth_recipes.sql — skipping recipe sync");
            progress.Report(Phase5("[Phase 5/5 — Crafting Recipes] Download failed — skipped."));
            return;
        }

        // Column order: (ID, Desynth, KeyItem, Wood, Smith, Gold, Cloth, Leather, Bone, Alchemy, Cook,
        //   Crystal, HQCrystal, Ingredient1-8, Result, ResultHQ1-3, ResultQty, ResultHQ1Qty-3Qty,
        //   ResultName, content_tag)
        // Groups 1-29 are integers; group 30 is content_tag (NULL or 'string')
        var recipeRegex = new System.Text.RegularExpressions.Regex(
            @"\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),'[^']*',(NULL|'[^']*')\)");

        var recipes = new List<SynthRecipe>();
        var ingredientsByRecipeId = new Dictionary<int, List<RecipeIngredient>>();

        foreach (System.Text.RegularExpressions.Match match in recipeRegex.Matches(sql))
        {
            ct.ThrowIfCancellationRequested();

            var id         = int.Parse(match.Groups[1].Value);
            var isDesynth  = match.Groups[2].Value == "1";
            // group 3 = KeyItem (skip)
            var wood       = int.Parse(match.Groups[4].Value);
            var smith      = int.Parse(match.Groups[5].Value);
            var gold       = int.Parse(match.Groups[6].Value);
            var cloth      = int.Parse(match.Groups[7].Value);
            var leather    = int.Parse(match.Groups[8].Value);
            var bone       = int.Parse(match.Groups[9].Value);
            var alchemy    = int.Parse(match.Groups[10].Value);
            var cook       = int.Parse(match.Groups[11].Value);
            var crystal    = int.Parse(match.Groups[12].Value);
            var hqCrystal  = int.Parse(match.Groups[13].Value);
            var ing1       = int.Parse(match.Groups[14].Value);
            var ing2       = int.Parse(match.Groups[15].Value);
            var ing3       = int.Parse(match.Groups[16].Value);
            var ing4       = int.Parse(match.Groups[17].Value);
            var ing5       = int.Parse(match.Groups[18].Value);
            var ing6       = int.Parse(match.Groups[19].Value);
            var ing7       = int.Parse(match.Groups[20].Value);
            var ing8       = int.Parse(match.Groups[21].Value);
            var result     = int.Parse(match.Groups[22].Value);
            var resultHq1  = int.Parse(match.Groups[23].Value);
            var resultHq2  = int.Parse(match.Groups[24].Value);
            var resultHq3  = int.Parse(match.Groups[25].Value);
            var resultQty  = int.Parse(match.Groups[26].Value);
            var resultHq1Qty = int.Parse(match.Groups[27].Value);
            var resultHq2Qty = int.Parse(match.Groups[28].Value);
            var resultHq3Qty = int.Parse(match.Groups[29].Value);
            var contentTagRaw = match.Groups[30].Value;
            var contentTag = contentTagRaw == "NULL" ? null : contentTagRaw.Trim('\'');

            recipes.Add(new SynthRecipe
            {
                Id           = id,
                IsDesynth    = isDesynth,
                Wood         = wood,
                Smith        = smith,
                Gold         = gold,
                Cloth        = cloth,
                Leather      = leather,
                Bone         = bone,
                Alchemy      = alchemy,
                Cook         = cook,
                CrystalItemId  = crystal,
                HqCrystalItemId = hqCrystal == 0 ? null : hqCrystal,
                ResultItemId = result,
                ResultQty    = resultQty,
                ResultHq1ItemId = resultHq1 == 0 ? null : resultHq1,
                ResultHq1Qty    = resultHq1Qty == 0 ? null : resultHq1Qty,
                ResultHq2ItemId = resultHq2 == 0 ? null : resultHq2,
                ResultHq2Qty    = resultHq2Qty == 0 ? null : resultHq2Qty,
                ResultHq3ItemId = resultHq3 == 0 ? null : resultHq3,
                ResultHq3Qty    = resultHq3Qty == 0 ? null : resultHq3Qty,
                ContentTag   = contentTag,
            });

            // Collapse the 8 ingredient slots into distinct (ItemId, Quantity) pairs.
            // Group duplicate item IDs and sum their counts; skip slots with value 0.
            var ingredientSlots = new[] { ing1, ing2, ing3, ing4, ing5, ing6, ing7, ing8 };
            var collapsed = ingredientSlots
                .Where(i => i != 0)
                .GroupBy(i => i)
                .Select(g => new RecipeIngredient
                {
                    RecipeId = id,
                    ItemId   = g.Key,
                    Quantity = g.Count(),
                })
                .ToList();

            ingredientsByRecipeId[id] = collapsed;
        }

        progress.Report(Phase5($"[Phase 5/5 — Crafting Recipes] Parsed {recipes.Count} recipes. Clearing existing data..."));

        // Clear-and-reinsert: delete ingredients first (FK references recipes), then recipes
        await db.RecipeIngredients.ExecuteDeleteAsync(ct);
        await db.SynthRecipes.ExecuteDeleteAsync(ct);

        progress.Report(Phase5($"[Phase 5/5 — Crafting Recipes] Inserting {recipes.Count} recipes..."));

        // Insert all recipes in batches
        var recipeInserted = 0;
        for (var batchStart = 0; batchStart < recipes.Count; batchStart += BatchSize)
        {
            ct.ThrowIfCancellationRequested();

            var batch = recipes.Skip(batchStart).Take(BatchSize).ToList();
            db.SynthRecipes.AddRange(batch);
            await db.SaveChangesAsync(ct);
            db.ChangeTracker.Clear();
            recipeInserted += batch.Count;

            progress.Report(Phase5($"[Phase 5/5 — Crafting Recipes] Inserted {recipeInserted} of {recipes.Count} recipes..."));
        }

        // Insert all ingredients in batches
        var allIngredients = ingredientsByRecipeId.Values.SelectMany(x => x).ToList();

        progress.Report(Phase5($"[Phase 5/5 — Crafting Recipes] Inserting {allIngredients.Count} ingredients..."));

        var ingredientInserted = 0;
        for (var batchStart = 0; batchStart < allIngredients.Count; batchStart += BatchSize)
        {
            ct.ThrowIfCancellationRequested();

            var batch = allIngredients.Skip(batchStart).Take(BatchSize).ToList();
            db.RecipeIngredients.AddRange(batch);
            await db.SaveChangesAsync(ct);
            db.ChangeTracker.Clear();
            ingredientInserted += batch.Count;
        }

        _logger.LogInformation("Recipe sync: {Recipes} recipes, {Ingredients} ingredients inserted",
            recipeInserted, ingredientInserted);

        progress.Report(Phase5($"[Phase 5/5 — Crafting Recipes] {recipeInserted} recipes and {ingredientInserted} ingredients inserted."));
    }

    /// <summary>
    /// Parse a uint16 (little-endian) from a hex string at the given slot index.
    /// Each slot is 4 hex chars (2 bytes). LE means byte[0] is low, byte[1] is high.
    /// </summary>
    private static int ParseUint16LE(string hex, int slotIndex)
    {
        var offset = slotIndex * 4;
        var lo = Convert.ToByte(hex.Substring(offset, 2), 16);
        var hi = Convert.ToByte(hex.Substring(offset + 2, 2), 16);
        return lo | (hi << 8);
    }

    /// <summary>
    /// Compute a hash of all mutable fields on a GameItem for change detection.
    /// </summary>
    private static string ComputeItemHash(GameItem item)
    {
        return ComputeHash(item.Name, item.Category, item.SubCategory, item.Type, item.Flags, item.StackSize,
            item.Level, item.Jobs, item.Races, item.Slots, item.Skill, item.ItemLevel,
            item.Damage, item.Delay, item.DEF, item.HP, item.MP,
            item.STR, item.DEX, item.VIT, item.AGI, item.INT, item.MND, item.CHR,
            item.Accuracy, item.Attack, item.RangedAccuracy, item.RangedAttack,
            item.MagicAccuracy, item.MagicDamage, item.MagicEvasion, item.Evasion,
            item.Enmity, item.Haste, item.StoreTP, item.TPBonus,
            item.PhysicalDamageTaken, item.MagicDamageTaken,
            item.Description, item.DescriptionJa,
            item.BaseSell);
    }

    private static string ComputeHash(params object?[] values)
    {
        var sb = new StringBuilder();
        foreach (var v in values)
            sb.Append(v?.ToString() ?? "null").Append('|');
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(bytes);
    }

    /// <summary>
    /// Columns updated when a GameItem's hash changes. ItemId is the join key.
    /// Order matches BuildChangedItemsDataTable / the UPDATE..SET clause below.
    /// </summary>
    private static readonly string[] ChangedItemColumns =
    [
        "ItemId", "Name", "NameJa", "NameLong",
        "Description", "DescriptionJa",
        "Category", "SubCategory", "Type", "Flags", "StackSize",
        "Level", "Jobs", "Races", "Slots", "Skill", "ItemLevel",
        "Damage", "Delay", "DEF", "HP", "MP",
        "STR", "DEX", "VIT", "AGI", "INT", "MND", "CHR",
        "Accuracy", "Attack", "RangedAccuracy", "RangedAttack",
        "MagicAccuracy", "MagicDamage", "MagicEvasion", "Evasion",
        "Enmity", "Haste", "StoreTP", "TPBonus",
        "PhysicalDamageTaken", "MagicDamageTaken",
        "UpdatedAt",
    ];

    private static async Task BulkUpdateChangedItemsAsync(
        VanalyticsDbContext db,
        IReadOnlyList<GameItem> changedItems,
        IProgress<SyncProgressEvent> progress,
        Func<string, int, int, int, int, SyncEventType, SyncProgressEvent> phaseEvent,
        int itemsAdded,
        int itemsTotal,
        CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        var wasOpen = conn.State == ConnectionState.Open;
        if (!wasOpen) await conn.OpenAsync(ct);

        try
        {
            // SELECT TOP 0 ... INTO clones column types from the source table —
            // safer than hand-typing schema (no drift if GameItem changes).
            var selectList = string.Join(", ", ChangedItemColumns.Select(QuoteIdent));
            await using (var create = conn.CreateCommand())
            {
                create.CommandText = $"SELECT TOP 0 {selectList} INTO #ChangedItems FROM GameItems";
                create.CommandTimeout = 60;
                await create.ExecuteNonQueryAsync(ct);
            }

            using (var bulk = new SqlBulkCopy(conn)
            {
                DestinationTableName = "#ChangedItems",
                BatchSize = 5000,
                BulkCopyTimeout = 300,
                NotifyAfter = 2500,
            })
            {
                foreach (var col in ChangedItemColumns) bulk.ColumnMappings.Add(col, col);

                bulk.SqlRowsCopied += (_, e) =>
                {
                    progress.Report(phaseEvent(
                        $"[Phase 1/5 — Items] Staged {e.RowsCopied:N0} of {changedItems.Count:N0} changed items...",
                        itemsAdded + (int)e.RowsCopied,
                        itemsTotal,
                        itemsAdded,
                        (int)e.RowsCopied,
                        SyncEventType.Progress));
                };

                using var table = BuildChangedItemsDataTable(changedItems);
                await bulk.WriteToServerAsync(table, ct);
            }

            // Single set-based UPDATE — one round-trip, server-side execution.
            var setClause = string.Join(",\n                    ",
                ChangedItemColumns
                    .Where(c => c != "ItemId")
                    .Select(c => $"g.{QuoteIdent(c)} = s.{QuoteIdent(c)}"));

            await using (var update = conn.CreateCommand())
            {
                update.CommandText = $@"
                UPDATE g SET
                    {setClause}
                FROM GameItems g
                INNER JOIN #ChangedItems s ON g.ItemId = s.ItemId";
                update.CommandTimeout = 300;
                await update.ExecuteNonQueryAsync(ct);
            }

            await using (var drop = conn.CreateCommand())
            {
                drop.CommandText = "DROP TABLE #ChangedItems";
                await drop.ExecuteNonQueryAsync(ct);
            }
        }
        finally
        {
            if (!wasOpen) await conn.CloseAsync();
        }
    }

    private static DataTable BuildChangedItemsDataTable(IReadOnlyList<GameItem> items)
    {
        var t = new DataTable();
        t.Columns.Add("ItemId", typeof(int));
        t.Columns.Add("Name", typeof(string));
        t.Columns.Add("NameJa", typeof(string)).AllowDBNull = true;
        t.Columns.Add("NameLong", typeof(string)).AllowDBNull = true;
        t.Columns.Add("Description", typeof(string)).AllowDBNull = true;
        t.Columns.Add("DescriptionJa", typeof(string)).AllowDBNull = true;
        t.Columns.Add("Category", typeof(string));
        t.Columns.Add("SubCategory", typeof(string)).AllowDBNull = true;
        t.Columns.Add("Type", typeof(int));
        t.Columns.Add("Flags", typeof(int));
        t.Columns.Add("StackSize", typeof(int));
        t.Columns.Add("Level", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Jobs", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Races", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Slots", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Skill", typeof(int)).AllowDBNull = true;
        t.Columns.Add("ItemLevel", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Damage", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Delay", typeof(int)).AllowDBNull = true;
        t.Columns.Add("DEF", typeof(int)).AllowDBNull = true;
        t.Columns.Add("HP", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MP", typeof(int)).AllowDBNull = true;
        t.Columns.Add("STR", typeof(int)).AllowDBNull = true;
        t.Columns.Add("DEX", typeof(int)).AllowDBNull = true;
        t.Columns.Add("VIT", typeof(int)).AllowDBNull = true;
        t.Columns.Add("AGI", typeof(int)).AllowDBNull = true;
        t.Columns.Add("INT", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MND", typeof(int)).AllowDBNull = true;
        t.Columns.Add("CHR", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Accuracy", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Attack", typeof(int)).AllowDBNull = true;
        t.Columns.Add("RangedAccuracy", typeof(int)).AllowDBNull = true;
        t.Columns.Add("RangedAttack", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MagicAccuracy", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MagicDamage", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MagicEvasion", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Evasion", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Enmity", typeof(int)).AllowDBNull = true;
        t.Columns.Add("Haste", typeof(int)).AllowDBNull = true;
        t.Columns.Add("StoreTP", typeof(int)).AllowDBNull = true;
        t.Columns.Add("TPBonus", typeof(int)).AllowDBNull = true;
        t.Columns.Add("PhysicalDamageTaken", typeof(int)).AllowDBNull = true;
        t.Columns.Add("MagicDamageTaken", typeof(int)).AllowDBNull = true;
        t.Columns.Add("UpdatedAt", typeof(DateTimeOffset));

        static object Null(object? v) => v ?? DBNull.Value;

        foreach (var i in items)
        {
            t.Rows.Add(
                i.ItemId, i.Name,
                Null(i.NameJa), Null(i.NameLong),
                Null(i.Description), Null(i.DescriptionJa),
                i.Category, Null(i.SubCategory),
                i.Type, i.Flags, i.StackSize,
                Null(i.Level), Null(i.Jobs), Null(i.Races), Null(i.Slots), Null(i.Skill), Null(i.ItemLevel),
                Null(i.Damage), Null(i.Delay), Null(i.DEF), Null(i.HP), Null(i.MP),
                Null(i.STR), Null(i.DEX), Null(i.VIT), Null(i.AGI), Null(i.INT), Null(i.MND), Null(i.CHR),
                Null(i.Accuracy), Null(i.Attack), Null(i.RangedAccuracy), Null(i.RangedAttack),
                Null(i.MagicAccuracy), Null(i.MagicDamage), Null(i.MagicEvasion), Null(i.Evasion),
                Null(i.Enmity), Null(i.Haste), Null(i.StoreTP), Null(i.TPBonus),
                Null(i.PhysicalDamageTaken), Null(i.MagicDamageTaken),
                i.UpdatedAt);
        }

        return t;
    }

    // SQL identifier quoting — wraps reserved words like INT/Type in brackets.
    private static string QuoteIdent(string ident) => $"[{ident}]";
}
