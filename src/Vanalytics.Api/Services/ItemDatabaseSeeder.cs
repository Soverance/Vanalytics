using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class ItemDatabaseSeeder
{
    private const string ItemsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/items.lua";
    private const string DescriptionsLuaUrl = "https://raw.githubusercontent.com/Windower/Resources/master/resources_data/item_descriptions.lua";

    public static async Task SeedAsync(
        VanalyticsDbContext db,
        IHttpClientFactory httpClientFactory,
        ILogger logger,
        CancellationToken ct = default)
    {
        if (await db.GameItems.AnyAsync(ct))
        {
            logger.LogInformation("Item database already seeded, skipping");
            return;
        }

        logger.LogInformation("Seeding item database from Windower Resources...");

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);

        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        var items = LuaResourceParser.ParseItems(itemsLua);
        var descriptions = LuaResourceParser.ParseDescriptions(descriptionsLua);

        logger.LogInformation("Parsed {Count} items, {DescCount} descriptions", items.Count, descriptions.Count);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            if (descriptions.TryGetValue(item.ItemId, out var desc))
            {
                item.Description = desc.En;
                item.DescriptionJa = desc.Ja;
                ItemStatExtractor.ExtractStats(item, desc.En);
            }
            item.CreatedAt = now;
            item.UpdatedAt = now;
        }

        const int batchSize = 1000;
        for (int i = 0; i < items.Count; i += batchSize)
        {
            var batch = items.Skip(i).Take(batchSize);
            db.GameItems.AddRange(batch);
            await db.SaveChangesAsync(ct);
            logger.LogDebug("Inserted items {Start}-{End}", i, Math.Min(i + batchSize, items.Count));
        }

        logger.LogInformation("Item database seeded: {Count} items", items.Count);
    }
}
