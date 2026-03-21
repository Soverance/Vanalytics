using Microsoft.EntityFrameworkCore;
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
    private const int UpdateProgressInterval = 500;

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

        var existingIds = await db.GameItems.Select(i => i.ItemId).ToHashSetAsync(ct);

        var newItems = items.Where(i => !existingIds.Contains(i.ItemId)).ToList();
        var existingItems = items.Where(i => existingIds.Contains(i.ItemId)).ToList();
        var total = items.Count;
        var added = 0;
        var updated = 0;

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

        // Update existing items
        foreach (var item in existingItems)
        {
            ct.ThrowIfCancellationRequested();

            var existing = await db.GameItems.FindAsync(new object[] { item.ItemId }, ct);
            if (existing is null) continue;

            existing.Name = item.Name;
            existing.NameJa = item.NameJa;
            existing.NameLong = item.NameLong;
            existing.Description = item.Description;
            existing.DescriptionJa = item.DescriptionJa;
            existing.Category = item.Category;
            existing.Type = item.Type;
            existing.Flags = item.Flags;
            existing.StackSize = item.StackSize;
            existing.Level = item.Level;
            existing.Jobs = item.Jobs;
            existing.Races = item.Races;
            existing.Slots = item.Slots;
            existing.Skill = item.Skill;
            existing.Damage = item.Damage;
            existing.Delay = item.Delay;
            existing.DEF = item.DEF;
            existing.HP = item.HP;
            existing.MP = item.MP;
            existing.STR = item.STR;
            existing.DEX = item.DEX;
            existing.VIT = item.VIT;
            existing.AGI = item.AGI;
            existing.INT = item.INT;
            existing.MND = item.MND;
            existing.CHR = item.CHR;
            existing.Accuracy = item.Accuracy;
            existing.Attack = item.Attack;
            existing.RangedAccuracy = item.RangedAccuracy;
            existing.RangedAttack = item.RangedAttack;
            existing.MagicAccuracy = item.MagicAccuracy;
            existing.MagicDamage = item.MagicDamage;
            existing.MagicEvasion = item.MagicEvasion;
            existing.Evasion = item.Evasion;
            existing.Enmity = item.Enmity;
            existing.Haste = item.Haste;
            existing.StoreTP = item.StoreTP;
            existing.TPBonus = item.TPBonus;
            existing.PhysicalDamageTaken = item.PhysicalDamageTaken;
            existing.MagicDamageTaken = item.MagicDamageTaken;
            existing.UpdatedAt = now;

            updated++;

            if (updated % UpdateProgressInterval == 0)
            {
                await db.SaveChangesAsync(ct);

                progress.Report(new SyncProgressEvent
                {
                    ProviderId = ProviderId,
                    Type = SyncEventType.Progress,
                    Message = $"Updated {updated} of {existingItems.Count} existing items...",
                    Current = added + updated,
                    Total = total,
                    Added = added,
                    Updated = updated
                });
            }
        }

        // Save any remaining updates
        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(ct);

        _logger.LogInformation("Item sync complete: {Total} items ({Added} added, {Updated} updated)", total, added, updated);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Sync complete: {added} added, {updated} updated.",
            Current = total,
            Total = total,
            Added = added,
            Updated = updated
        });
    }
}
