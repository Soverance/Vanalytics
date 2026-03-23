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
    private const int BatchSize = 1000;

    public string ProviderId => "items";
    public string DisplayName => "Item Database";

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
            Message = "Downloading item data from Windower Resources..."
        });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "Parsing item data..."
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
            Message = $"Found {newItems.Count} new, {changedItems.Count} changed, {skipped} unchanged items.",
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
                    Message = $"Inserted {added} of {newItems.Count} new items...",
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
                    Message = $"Updated {updated} of {changedItems.Count} changed items...",
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

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Sync complete: {added} added, {updated} updated, {skipped} unchanged.",
            Current = total,
            Total = total,
            Added = added,
            Updated = updated
        });
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
            item.Description, item.DescriptionJa);
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
