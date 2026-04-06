using System.Security.Cryptography;
using System.Text;
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
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "[Phase 1/4 — Items] Downloading item data from Windower Resources..."
        });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 1/4 — Items] Parsing item data..."
        });

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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 1/4 — Items] Found {newItems.Count} new, {changedItems.Count} changed, {skipped} unchanged items.",
            Total = total
        });

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

                progress.Report(new SyncProgressEvent
                {
                    ProviderId = ProviderId,
                    Type = SyncEventType.Progress,
                    Message = $"[Phase 1/4 — Items] Inserted {added} of {newItems.Count} new items...",
                    Current = added,
                    Total = total,
                    Added = added,
                    Updated = updated
                });
            }

            _logger.LogInformation("Added {Count} new items", added);
        }

        // Update only changed items using ExecuteUpdateAsync (no entity tracking)
        if (changedItems.Count > 0)
        {
            for (var batchStart = 0; batchStart < changedItems.Count; batchStart += BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = changedItems.Skip(batchStart).Take(BatchSize).ToList();
                foreach (var item in batch)
                {
                    await db.GameItems
                        .Where(i => i.ItemId == item.ItemId)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(i => i.Name, item.Name)
                            .SetProperty(i => i.NameJa, item.NameJa)
                            .SetProperty(i => i.NameLong, item.NameLong)
                            .SetProperty(i => i.Description, item.Description)
                            .SetProperty(i => i.DescriptionJa, item.DescriptionJa)
                            .SetProperty(i => i.Category, item.Category)
                            .SetProperty(i => i.SubCategory, item.SubCategory)
                            .SetProperty(i => i.Type, item.Type)
                            .SetProperty(i => i.Flags, item.Flags)
                            .SetProperty(i => i.StackSize, item.StackSize)
                            .SetProperty(i => i.Level, item.Level)
                            .SetProperty(i => i.Jobs, item.Jobs)
                            .SetProperty(i => i.Races, item.Races)
                            .SetProperty(i => i.Slots, item.Slots)
                            .SetProperty(i => i.Skill, item.Skill)
                            .SetProperty(i => i.ItemLevel, item.ItemLevel)
                            .SetProperty(i => i.Damage, item.Damage)
                            .SetProperty(i => i.Delay, item.Delay)
                            .SetProperty(i => i.DEF, item.DEF)
                            .SetProperty(i => i.HP, item.HP)
                            .SetProperty(i => i.MP, item.MP)
                            .SetProperty(i => i.STR, item.STR)
                            .SetProperty(i => i.DEX, item.DEX)
                            .SetProperty(i => i.VIT, item.VIT)
                            .SetProperty(i => i.AGI, item.AGI)
                            .SetProperty(i => i.INT, item.INT)
                            .SetProperty(i => i.MND, item.MND)
                            .SetProperty(i => i.CHR, item.CHR)
                            .SetProperty(i => i.Accuracy, item.Accuracy)
                            .SetProperty(i => i.Attack, item.Attack)
                            .SetProperty(i => i.RangedAccuracy, item.RangedAccuracy)
                            .SetProperty(i => i.RangedAttack, item.RangedAttack)
                            .SetProperty(i => i.MagicAccuracy, item.MagicAccuracy)
                            .SetProperty(i => i.MagicDamage, item.MagicDamage)
                            .SetProperty(i => i.MagicEvasion, item.MagicEvasion)
                            .SetProperty(i => i.Evasion, item.Evasion)
                            .SetProperty(i => i.Enmity, item.Enmity)
                            .SetProperty(i => i.Haste, item.Haste)
                            .SetProperty(i => i.StoreTP, item.StoreTP)
                            .SetProperty(i => i.TPBonus, item.TPBonus)
                            .SetProperty(i => i.PhysicalDamageTaken, item.PhysicalDamageTaken)
                            .SetProperty(i => i.MagicDamageTaken, item.MagicDamageTaken)
                            .SetProperty(i => i.UpdatedAt, now),
                        ct);

                    updated++;
                }

                progress.Report(new SyncProgressEvent
                {
                    ProviderId = ProviderId,
                    Type = SyncEventType.Progress,
                    Message = $"[Phase 1/4 — Items] Updated {updated} of {changedItems.Count} changed items...",
                    Current = added + updated,
                    Total = total,
                    Added = added,
                    Updated = updated
                });
            }

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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Sync complete: {added} added, {updated} updated, {skipped} unchanged. Model mappings, NPC pools, and sell prices updated.",
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
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 2/4 — Model Mappings] Downloading from LandSandBoat...",
            Current = itemsAdded + itemsUpdated,
            Total = itemsTotal
        });

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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/4 — Model Mappings] Parsed {parsed.Count} entries. Updating database..."
        });

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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/4 — Model Mappings] {modelAdded} added, {modelUpdated} updated, {modelSkipped} unchanged."
        });
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
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 3/4 — NPC Pools] Downloading mob pool data from LandSandBoat..."
        });

        string sql;
        try
        {
            sql = await client.GetStringAsync(MobPoolsUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download mob pools — skipping");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = "[Phase 3/4 — NPC Pools] Download failed — skipped."
            });
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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 3/4 — NPC Pools] Parsed {parsed.Count} NPC pools. Updating database..."
        });

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

                    progress.Report(new SyncProgressEvent
                    {
                        ProviderId = ProviderId,
                        Type = SyncEventType.Progress,
                        Message = $"[Phase 3/4 — NPC Pools] Inserted {npcAdded} pools so far..."
                    });
                }
            }
        }

        await db.SaveChangesAsync(ct);
        foreach (var entry in db.ChangeTracker.Entries().ToList())
            entry.State = EntityState.Detached;

        _logger.LogInformation("NPC pool sync: {Added} added, {Updated} updated, {Skipped} unchanged",
            npcAdded, npcUpdated, npcSkipped);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 3/4 — NPC Pools] {npcAdded} added, {npcUpdated} updated, {npcSkipped} unchanged."
        });
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
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 4/4 — Sell Prices] Downloading item_basic.sql from LandSandBoat..."
        });

        string sql;
        try
        {
            sql = await client.GetStringAsync(ItemBasicUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download item_basic.sql — skipping BaseSell sync");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = "[Phase 4/4 — Sell Prices] Download failed — skipped."
            });
            return;
        }

        // Parse INSERT statements:
        // (itemId,subid,'name','sortname',stackSize,flags,aH,noSale,BaseSell,...)
        var parsed = new Dictionary<int, int>();
        var regex = new System.Text.RegularExpressions.Regex(
            @"\((\d+),\d+,'[^']*','[^']*',\d+,\d+,\d+,\d+,(\d+)");

        foreach (System.Text.RegularExpressions.Match match in regex.Matches(sql))
        {
            var itemId = int.Parse(match.Groups[1].Value);
            var baseSell = int.Parse(match.Groups[2].Value);
            parsed[itemId] = baseSell;
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 4/4 — Sell Prices] Parsed {parsed.Count} entries. Checking for changes..."
        });

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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 4/4 — Sell Prices] {sellUpdated} updated, {sellSkipped} unchanged."
        });
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
}
