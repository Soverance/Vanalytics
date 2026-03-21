using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class ItemDatabaseSyncJob : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ItemDatabaseSyncJob> _logger;
    private static readonly TimeSpan SyncInterval = TimeSpan.FromHours(24);

    private const string ItemsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/items.lua";
    private const string DescriptionsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/item_descriptions.lua";

    private string? _lastItemsHash;

    public ItemDatabaseSyncJob(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ItemDatabaseSyncJob> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Item database sync failed");
            }

            await Task.Delay(SyncInterval, stoppingToken);
        }
    }

    private async Task SyncAsync(CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);

        var hash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(itemsLua)));

        if (hash == _lastItemsHash)
        {
            _logger.LogDebug("Item database unchanged, skipping sync");
            return;
        }

        _logger.LogInformation("Item database changed, syncing...");

        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        var items = LuaResourceParser.ParseItems(itemsLua);
        var descriptions = LuaResourceParser.ParseDescriptions(descriptionsLua);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            if (descriptions.TryGetValue(item.ItemId, out var desc))
            {
                item.Description = desc.En;
                item.DescriptionJa = desc.Ja;
                ItemStatExtractor.ExtractStats(item, desc.En);
            }
            item.UpdatedAt = now;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var existingIds = await db.GameItems.Select(i => i.ItemId).ToHashSetAsync(ct);

        var newItems = items.Where(i => !existingIds.Contains(i.ItemId)).ToList();
        foreach (var item in newItems)
            item.CreatedAt = now;

        if (newItems.Count > 0)
        {
            db.GameItems.AddRange(newItems);
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Added {Count} new items", newItems.Count);
        }

        // Update existing items
        var updatedItems = items.Where(i => existingIds.Contains(i.ItemId)).ToList();
        foreach (var item in updatedItems)
        {
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
        }

        await db.SaveChangesAsync(ct);
        _lastItemsHash = hash;
        _logger.LogInformation("Item database sync complete: {Total} items ({New} new)", items.Count, newItems.Count);
    }
}
