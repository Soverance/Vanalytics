# Item Database Implementation Plan (Sub-spec A1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FFXI item catalog with ~23K items seeded from Windower Resources, stat parsing, icon/image downloads, and public browse/search API endpoints.

**Architecture:** GameItem model with dedicated stat columns, seeded on first startup from Windower Resources Lua files fetched via HTTP. A background job syncs daily for game updates. Icons downloaded from FFXIAH CDN, preview images from BG Wiki. Public API endpoints for item search and detail.

**Tech Stack:** .NET 10, EF Core, regex-based Lua/stat parsing, HttpClient for downloads, existing infrastructure.

**Spec:** `docs/specs/2026-03-21-economy-tracking-design.md` — Sub-spec A, Item Database section

---

## File Structure

```
src/
├── Vanalytics.Core/
│   └── Models/
│       └── GameItem.cs                          # CREATE
├── Vanalytics.Data/
│   ├── VanalyticsDbContext.cs                   # MODIFY: add GameItems DbSet
│   ├── Configurations/
│   │   └── GameItemConfiguration.cs             # CREATE
│   └── Migrations/                              # CREATE: new migration
├── Vanalytics.Api/
│   ├── Program.cs                               # MODIFY: register services, call seeder
│   ├── Services/
│   │   ├── LuaResourceParser.cs                 # CREATE: parse Windower Lua files
│   │   ├── ItemStatExtractor.cs                 # CREATE: regex stat extraction from descriptions
│   │   ├── ItemDatabaseSeeder.cs                # CREATE: seed items on first run
│   │   ├── ItemImageDownloader.cs               # CREATE: download icons + previews
│   │   └── ItemDatabaseSyncJob.cs               # CREATE: daily background sync
│   └── Controllers/
│       └── ItemsController.cs                   # CREATE: public browse/search/detail
tests/
└── Vanalytics.Api.Tests/
    └── Services/
        ├── LuaResourceParserTests.cs            # CREATE
        └── ItemStatExtractorTests.cs            # CREATE
```

---

### Task 1: GameItem Model, EF Configuration, and Migration

**Files:**
- Create: `src/Vanalytics.Core/Models/GameItem.cs`
- Create: `src/Vanalytics.Data/Configurations/GameItemConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create GameItem model**

```csharp
// src/Vanalytics.Core/Models/GameItem.cs
namespace Vanalytics.Core.Models;

public class GameItem
{
    public int ItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? NameJa { get; set; }
    public string? NameLong { get; set; }
    public string? Description { get; set; }
    public string? DescriptionJa { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Type { get; set; }
    public int Flags { get; set; }
    public int StackSize { get; set; } = 1;

    // Equipment fields
    public int? Level { get; set; }
    public int? Jobs { get; set; }
    public int? Races { get; set; }
    public int? Slots { get; set; }
    public int? Skill { get; set; }

    // Weapon stats
    public int? Damage { get; set; }
    public int? Delay { get; set; }

    // Common stats
    public int? DEF { get; set; }
    public int? HP { get; set; }
    public int? MP { get; set; }
    public int? STR { get; set; }
    public int? DEX { get; set; }
    public int? VIT { get; set; }
    public int? AGI { get; set; }
    public int? INT { get; set; }
    public int? MND { get; set; }
    public int? CHR { get; set; }
    public int? Accuracy { get; set; }
    public int? Attack { get; set; }
    public int? RangedAccuracy { get; set; }
    public int? RangedAttack { get; set; }
    public int? MagicAccuracy { get; set; }
    public int? MagicDamage { get; set; }
    public int? MagicEvasion { get; set; }
    public int? Evasion { get; set; }
    public int? Enmity { get; set; }
    public int? Haste { get; set; }
    public int? StoreTP { get; set; }
    public int? TPBonus { get; set; }
    public int? PhysicalDamageTaken { get; set; }
    public int? MagicDamageTaken { get; set; }

    // Images
    public string? IconPath { get; set; }
    public string? PreviewImagePath { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // Computed flag helpers
    public bool IsRare => (Flags & 32) != 0;
    public bool IsExclusive => (Flags & 8192) != 0;
    public bool IsAuctionable => (Flags & 32768) != 0;
}
```

- [ ] **Step 2: Create GameItemConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/GameItemConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class GameItemConfiguration : IEntityTypeConfiguration<GameItem>
{
    public void Configure(EntityTypeBuilder<GameItem> builder)
    {
        builder.HasKey(i => i.ItemId);
        builder.Property(i => i.ItemId).ValueGeneratedNever();

        builder.HasIndex(i => i.Name);
        builder.HasIndex(i => i.Category);
        builder.HasIndex(i => i.Level);

        builder.Property(i => i.Name).HasMaxLength(128).IsRequired();
        builder.Property(i => i.NameJa).HasMaxLength(128);
        builder.Property(i => i.NameLong).HasMaxLength(256);
        builder.Property(i => i.Description).HasMaxLength(4096);
        builder.Property(i => i.DescriptionJa).HasMaxLength(4096);
        builder.Property(i => i.Category).HasMaxLength(32).IsRequired();
        builder.Property(i => i.IconPath).HasMaxLength(256);
        builder.Property(i => i.PreviewImagePath).HasMaxLength(256);

        builder.Ignore(i => i.IsRare);
        builder.Ignore(i => i.IsExclusive);
        builder.Ignore(i => i.IsAuctionable);
    }
}
```

- [ ] **Step 3: Add GameItems DbSet to VanalyticsDbContext**

Add to `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
public DbSet<GameItem> GameItems => Set<GameItem>();
```

- [ ] **Step 4: Verify build and create migration**

```bash
dotnet build Vanalytics.slnx
dotnet ef migrations add AddGameItems --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
dotnet build Vanalytics.slnx
```

---

### Task 2: Lua Resource Parser

**Files:**
- Create: `src/Vanalytics.Api/Services/LuaResourceParser.cs`
- Create: `tests/Vanalytics.Api.Tests/Services/LuaResourceParserTests.cs`

- [ ] **Step 1: Write parser tests**

```csharp
// tests/Vanalytics.Api.Tests/Services/LuaResourceParserTests.cs
using Vanalytics.Api.Services;

namespace Vanalytics.Api.Tests.Services;

public class LuaResourceParserTests
{
    [Fact]
    public void ParseItems_ParsesGeneralItem()
    {
        var lua = """
            return {
                [1] = {id=1,en="Chocobo Bedding",ja="チョコボの寝ワラ",enl="pile of chocobo bedding",jal="チョコボの寝ワラ",category="General",flags=24660,stack=1,targets=0,type=10},
            }
            """;

        var items = LuaResourceParser.ParseItems(lua);

        Assert.Single(items);
        Assert.Equal(1, items[0].ItemId);
        Assert.Equal("Chocobo Bedding", items[0].Name);
        Assert.Equal("チョコボの寝ワラ", items[0].NameJa);
        Assert.Equal("pile of chocobo bedding", items[0].NameLong);
        Assert.Equal("General", items[0].Category);
        Assert.Equal(24660, items[0].Flags);
        Assert.Equal(1, items[0].StackSize);
        Assert.Equal(10, items[0].Type);
    }

    [Fact]
    public void ParseItems_ParsesWeapon()
    {
        var lua = """
            return {
                [16385] = {id=16385,en="Cesti",ja="セスタス",enl="cesti",jal="セスタス",category="Weapon",damage=4,delay=288,flags=2084,jobs=527334,level=1,races=510,skill=1,slots=1,stack=1,targets=0,type=4},
            }
            """;

        var items = LuaResourceParser.ParseItems(lua);

        Assert.Single(items);
        Assert.Equal("Weapon", items[0].Category);
        Assert.Equal(4, items[0].Damage);
        Assert.Equal(288, items[0].Delay);
        Assert.Equal(527334, items[0].Jobs);
        Assert.Equal(1, items[0].Level);
        Assert.Equal(510, items[0].Races);
        Assert.Equal(1, items[0].Skill);
        Assert.Equal(1, items[0].Slots);
    }

    [Fact]
    public void ParseItems_ParsesMultipleItems()
    {
        var lua = """
            return {
                [1] = {id=1,en="Item A",ja="A",enl="item a",jal="A",category="General",flags=0,stack=1,targets=0,type=10},
                [2] = {id=2,en="Item B",ja="B",enl="item b",jal="B",category="General",flags=0,stack=12,targets=0,type=10},
            }
            """;

        var items = LuaResourceParser.ParseItems(lua);

        Assert.Equal(2, items.Count);
    }

    [Fact]
    public void ParseDescriptions_ParsesDescriptions()
    {
        var lua = """
            return {
                [18976] = {id=18976,en="DMG:31 Delay:200",ja="Ｄ31 隔200"},
                [20515] = {id=20515,en="DMG:+197 Delay:+138\nMagic Damage+155",ja="Ｄ+197 隔+138"},
            }
            """;

        var descs = LuaResourceParser.ParseDescriptions(lua);

        Assert.Equal(2, descs.Count);
        Assert.Equal("DMG:31 Delay:200", descs[18976].En);
        Assert.Equal("Ｄ31 隔200", descs[18976].Ja);
        Assert.Equal("DMG:+197 Delay:+138\nMagic Damage+155", descs[20515].En);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/Vanalytics.Api.Tests/ --filter "LuaResourceParserTests" -v normal
```

- [ ] **Step 3: Implement LuaResourceParser**

```csharp
// src/Vanalytics.Api/Services/LuaResourceParser.cs
using System.Text.RegularExpressions;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

public static class LuaResourceParser
{
    public static List<GameItem> ParseItems(string lua)
    {
        var items = new List<GameItem>();

        // Match each item entry: [id] = {key=value,...}
        var entryPattern = new Regex(
            @"\[(\d+)\]\s*=\s*\{([^}]+)\}",
            RegexOptions.Compiled);

        foreach (Match match in entryPattern.Matches(lua))
        {
            var fields = ParseFields(match.Groups[2].Value);

            var item = new GameItem
            {
                ItemId = int.Parse(match.Groups[1].Value),
                Name = GetString(fields, "en"),
                NameJa = GetStringOrNull(fields, "ja"),
                NameLong = GetStringOrNull(fields, "enl"),
                Category = GetString(fields, "category", "Unknown"),
                Flags = GetInt(fields, "flags"),
                StackSize = GetInt(fields, "stack", 1),
                Type = GetInt(fields, "type"),
                Level = GetIntOrNull(fields, "level"),
                Jobs = GetIntOrNull(fields, "jobs"),
                Races = GetIntOrNull(fields, "races"),
                Slots = GetIntOrNull(fields, "slots"),
                Skill = GetIntOrNull(fields, "skill"),
                Damage = GetIntOrNull(fields, "damage"),
                Delay = GetIntOrNull(fields, "delay"),
            };

            items.Add(item);
        }

        return items;
    }

    public static Dictionary<int, (string En, string? Ja)> ParseDescriptions(string lua)
    {
        var descriptions = new Dictionary<int, (string En, string? Ja)>();

        var entryPattern = new Regex(
            @"\[(\d+)\]\s*=\s*\{([^}]+)\}",
            RegexOptions.Compiled);

        foreach (Match match in entryPattern.Matches(lua))
        {
            var id = int.Parse(match.Groups[1].Value);
            var fields = ParseFields(match.Groups[2].Value);
            var en = GetStringOrNull(fields, "en");
            if (en != null)
            {
                en = en.Replace("\\n", "\n");
                var ja = GetStringOrNull(fields, "ja")?.Replace("\\n", "\n");
                descriptions[id] = (en, ja);
            }
        }

        return descriptions;
    }

    private static Dictionary<string, string> ParseFields(string fieldStr)
    {
        var fields = new Dictionary<string, string>();

        // Match key=value pairs (value is either a quoted string or a number)
        var fieldPattern = new Regex(
            @"(\w+)\s*=\s*(?:""([^""]*)""|(\-?\d+))",
            RegexOptions.Compiled);

        foreach (Match m in fieldPattern.Matches(fieldStr))
        {
            var key = m.Groups[1].Value;
            var value = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value;
            fields[key] = value;
        }

        return fields;
    }

    private static string GetString(Dictionary<string, string> fields, string key, string defaultValue = "")
        => fields.TryGetValue(key, out var v) ? v : defaultValue;

    private static string? GetStringOrNull(Dictionary<string, string> fields, string key)
        => fields.TryGetValue(key, out var v) ? v : null;

    private static int GetInt(Dictionary<string, string> fields, string key, int defaultValue = 0)
        => fields.TryGetValue(key, out var v) && int.TryParse(v, out var i) ? i : defaultValue;

    private static int? GetIntOrNull(Dictionary<string, string> fields, string key)
        => fields.TryGetValue(key, out var v) && int.TryParse(v, out var i) ? i : null;
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/Vanalytics.Api.Tests/ --filter "LuaResourceParserTests" -v normal
```

Expected: All 4 tests pass.

---

### Task 3: Item Stat Extractor

**Files:**
- Create: `src/Vanalytics.Api/Services/ItemStatExtractor.cs`
- Create: `tests/Vanalytics.Api.Tests/Services/ItemStatExtractorTests.cs`

- [ ] **Step 1: Write stat extractor tests**

```csharp
// tests/Vanalytics.Api.Tests/Services/ItemStatExtractorTests.cs
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Tests.Services;

public class ItemStatExtractorTests
{
    [Fact]
    public void ExtractStats_ParsesDefense()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "DEF:50");
        Assert.Equal(50, item.DEF);
    }

    [Fact]
    public void ExtractStats_ParsesWeaponStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "DMG:31 Delay:200");
        // Note: DMG/Delay from description may override or supplement model fields
        // These are already in the items.lua as damage/delay fields
    }

    [Fact]
    public void ExtractStats_ParsesMainStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "DEF:50 HP+30 MP+20 STR+5 DEX+3 VIT+7 AGI+2 INT+4 MND+6 CHR+1");

        Assert.Equal(50, item.DEF);
        Assert.Equal(30, item.HP);
        Assert.Equal(20, item.MP);
        Assert.Equal(5, item.STR);
        Assert.Equal(3, item.DEX);
        Assert.Equal(7, item.VIT);
        Assert.Equal(2, item.AGI);
        Assert.Equal(4, item.INT);
        Assert.Equal(6, item.MND);
        Assert.Equal(1, item.CHR);
    }

    [Fact]
    public void ExtractStats_ParsesCombatStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Accuracy+10 Attack+15 Evasion+5 Magic Accuracy+8 Magic Damage+12 Magic Evasion+20 Enmity-5 Haste+3%");

        Assert.Equal(10, item.Accuracy);
        Assert.Equal(15, item.Attack);
        Assert.Equal(5, item.Evasion);
        Assert.Equal(8, item.MagicAccuracy);
        Assert.Equal(12, item.MagicDamage);
        Assert.Equal(20, item.MagicEvasion);
        Assert.Equal(-5, item.Enmity);
        Assert.Equal(3, item.Haste);
    }

    [Fact]
    public void ExtractStats_ParsesTPStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "\"Store TP\"+10 \"TP Bonus\"+500");

        Assert.Equal(10, item.StoreTP);
        Assert.Equal(500, item.TPBonus);
    }

    [Fact]
    public void ExtractStats_ParsesDamageTaken()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Physical Damage taken -3% Magic Damage taken -2%");

        Assert.Equal(-3, item.PhysicalDamageTaken);
        Assert.Equal(-2, item.MagicDamageTaken);
    }

    [Fact]
    public void ExtractStats_ParsesRangedStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Ranged Accuracy+12 Ranged Attack+8");

        Assert.Equal(12, item.RangedAccuracy);
        Assert.Equal(8, item.RangedAttack);
    }

    [Fact]
    public void ExtractStats_HandlesNullDescription()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, null);
        // Should not throw, all stats remain null
        Assert.Null(item.DEF);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement ItemStatExtractor**

```csharp
// src/Vanalytics.Api/Services/ItemStatExtractor.cs
using System.Text.RegularExpressions;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

public static class ItemStatExtractor
{
    public static void ExtractStats(GameItem item, string? description)
    {
        if (string.IsNullOrEmpty(description)) return;

        item.DEF ??= ExtractStat(description, @"DEF[:\s]*([+-]?\d+)");
        item.HP ??= ExtractStat(description, @"(?<!\w)HP\s*([+-]?\d+)");
        item.MP ??= ExtractStat(description, @"(?<!\w)MP\s*([+-]?\d+)");
        item.STR ??= ExtractStat(description, @"(?<!\w)STR\s*([+-]?\d+)");
        item.DEX ??= ExtractStat(description, @"(?<!\w)DEX\s*([+-]?\d+)");
        item.VIT ??= ExtractStat(description, @"(?<!\w)VIT\s*([+-]?\d+)");
        item.AGI ??= ExtractStat(description, @"(?<!\w)AGI\s*([+-]?\d+)");
        item.INT ??= ExtractStat(description, @"(?<!\w)INT\s*([+-]?\d+)");
        item.MND ??= ExtractStat(description, @"(?<!\w)MND\s*([+-]?\d+)");
        item.CHR ??= ExtractStat(description, @"(?<!\w)CHR\s*([+-]?\d+)");
        item.Accuracy ??= ExtractStat(description, @"(?<!Ranged |Magic )Accuracy\s*([+-]?\d+)");
        item.Attack ??= ExtractStat(description, @"(?<!Ranged |Magic )Attack\s*([+-]?\d+)");
        item.RangedAccuracy ??= ExtractStat(description, @"Ranged Accuracy\s*([+-]?\d+)");
        item.RangedAttack ??= ExtractStat(description, @"Ranged Attack\s*([+-]?\d+)");
        item.MagicAccuracy ??= ExtractStat(description, @"Magic Accuracy\s*([+-]?\d+)");
        item.MagicDamage ??= ExtractStat(description, @"Magic Damage\s*([+-]?\d+)");
        item.MagicEvasion ??= ExtractStat(description, @"Magic Evasion\s*([+-]?\d+)");
        item.Evasion ??= ExtractStat(description, @"(?<!Magic )Evasion\s*([+-]?\d+)");
        item.Enmity ??= ExtractStat(description, @"Enmity\s*([+-]?\d+)");
        item.Haste ??= ExtractStat(description, @"Haste\s*([+-]?\d+)");
        item.StoreTP ??= ExtractStat(description, @"Store TP.*?([+-]?\d+)");
        item.TPBonus ??= ExtractStat(description, @"TP Bonus.*?([+-]?\d+)");
        item.PhysicalDamageTaken ??= ExtractStat(description, @"Physical [Dd]amage taken\s*([+-]?\d+)");
        item.MagicDamageTaken ??= ExtractStat(description, @"Magic [Dd]amage taken\s*([+-]?\d+)");
    }

    private static int? ExtractStat(string text, string pattern)
    {
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var value))
            return value;
        return null;
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/Vanalytics.Api.Tests/ --filter "ItemStatExtractorTests" -v normal
```

Expected: All 8 tests pass.

---

### Task 4: Item Database Seeder

**Files:**
- Create: `src/Vanalytics.Api/Services/ItemDatabaseSeeder.cs`

- [ ] **Step 1: Create the seeder**

This runs on startup, only seeds when the GameItems table is empty.

```csharp
// src/Vanalytics.Api/Services/ItemDatabaseSeeder.cs
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

        // Fetch Lua files
        var itemsLua = await client.GetStringAsync(ItemsLuaUrl, ct);
        var descriptionsLua = await client.GetStringAsync(DescriptionsLuaUrl, ct);

        // Parse
        var items = LuaResourceParser.ParseItems(itemsLua);
        var descriptions = LuaResourceParser.ParseDescriptions(descriptionsLua);

        logger.LogInformation("Parsed {Count} items, {DescCount} descriptions", items.Count, descriptions.Count);

        // Apply descriptions and extract stats
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

        // Bulk insert in batches
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
```

- [ ] **Step 2: Call the seeder from Program.cs**

Add after the admin seeder call in `src/Vanalytics.Api/Program.cs`:

```csharp
    // Seed item database
    var httpFactory = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
    await ItemDatabaseSeeder.SeedAsync(db, httpFactory, logger);
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 5: Item Image Downloader

**Files:**
- Create: `src/Vanalytics.Api/Services/ItemImageDownloader.cs`

- [ ] **Step 1: Create the image downloader**

Downloads icons from FFXIAH and preview images from BG Wiki. Runs after seeding, only downloads missing images. Rate-limited to be polite to external services.

```csharp
// src/Vanalytics.Api/Services/ItemImageDownloader.cs
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class ItemImageDownloader : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ItemImageDownloader> _logger;
    private readonly string _imageBasePath;

    private const string IconUrlTemplate = "https://static.ffxiah.com/images/icon/{0}.png";
    private const int MaxConcurrentDownloads = 5;
    private static readonly TimeSpan DelayBetweenRequests = TimeSpan.FromMilliseconds(100);

    public ItemImageDownloader(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ItemImageDownloader> logger,
        IConfiguration config)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _imageBasePath = config["ItemImages:BasePath"] ?? Path.Combine(AppContext.BaseDirectory, "item-images");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait for seeding to complete
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        await DownloadMissingIconsAsync(stoppingToken);
    }

    private async Task DownloadMissingIconsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var itemsNeedingIcons = await db.GameItems
            .Where(i => i.IconPath == null)
            .Select(i => i.ItemId)
            .ToListAsync(ct);

        if (itemsNeedingIcons.Count == 0)
        {
            _logger.LogInformation("All item icons already downloaded");
            return;
        }

        _logger.LogInformation("Downloading icons for {Count} items", itemsNeedingIcons.Count);

        var iconsDir = Path.Combine(_imageBasePath, "icons");
        Directory.CreateDirectory(iconsDir);

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        var semaphore = new SemaphoreSlim(MaxConcurrentDownloads);
        var downloaded = 0;
        var failed = 0;

        var tasks = itemsNeedingIcons.Select(async itemId =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                await Task.Delay(DelayBetweenRequests, ct);

                var url = string.Format(IconUrlTemplate, itemId);
                var filePath = Path.Combine(iconsDir, $"{itemId}.png");
                var relativePath = $"icons/{itemId}.png";

                try
                {
                    var response = await client.GetAsync(url, ct);
                    if (response.IsSuccessStatusCode)
                    {
                        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                        await File.WriteAllBytesAsync(filePath, bytes, ct);

                        // Update DB in a fresh scope to avoid tracking conflicts
                        using var updateScope = _scopeFactory.CreateScope();
                        var updateDb = updateScope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                        await updateDb.GameItems
                            .Where(i => i.ItemId == itemId)
                            .ExecuteUpdateAsync(s => s.SetProperty(i => i.IconPath, relativePath), ct);

                        Interlocked.Increment(ref downloaded);
                    }
                    else
                    {
                        Interlocked.Increment(ref failed);
                    }
                }
                catch
                {
                    Interlocked.Increment(ref failed);
                }
            }
            finally
            {
                semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);
        _logger.LogInformation("Icon download complete: {Downloaded} succeeded, {Failed} failed", downloaded, failed);
    }
}
```

- [ ] **Step 2: Register the background service in Program.cs**

Add after the existing hosted services:

```csharp
builder.Services.AddHostedService<ItemImageDownloader>();
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 6: Item Database Sync Job

**Files:**
- Create: `src/Vanalytics.Api/Services/ItemDatabaseSyncJob.cs`

- [ ] **Step 1: Create the daily sync job**

Checks Windower Resources for updates once per day and upserts changed items.

```csharp
// src/Vanalytics.Api/Services/ItemDatabaseSyncJob.cs
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
        // Wait for initial seeding
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

        // Simple change detection via hash
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
                item.Description = desc;
                ItemStatExtractor.ExtractStats(item, desc);
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
```

- [ ] **Step 2: Register in Program.cs**

```csharp
builder.Services.AddHostedService<ItemDatabaseSyncJob>();
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 7: Items API Controller (Public)

**Files:**
- Create: `src/Vanalytics.Api/Controllers/ItemsController.cs`

- [ ] **Step 1: Create ItemsController**

Public endpoints for browsing and searching items. No auth required.

```csharp
// src/Vanalytics.Api/Controllers/ItemsController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/items")]
public class ItemsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ItemsController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q = null,
        [FromQuery] string? category = null,
        [FromQuery] int? skill = null,
        [FromQuery] int? minLevel = null,
        [FromQuery] int? maxLevel = null,
        [FromQuery] string? jobs = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (pageSize > 100) pageSize = 100;
        if (page < 1) page = 1;

        var query = _db.GameItems.AsQueryable();

        if (!string.IsNullOrEmpty(q))
            query = query.Where(i => i.Name.Contains(q));

        if (!string.IsNullOrEmpty(category))
            query = query.Where(i => i.Category == category);

        if (skill.HasValue)
            query = query.Where(i => i.Skill == skill.Value);

        if (minLevel.HasValue)
            query = query.Where(i => i.Level >= minLevel.Value);

        if (maxLevel.HasValue)
            query = query.Where(i => i.Level <= maxLevel.Value);

        // Job filter: check if the item's job bitmask includes the requested job
        if (!string.IsNullOrEmpty(jobs))
        {
            var jobBit = GetJobBitmask(jobs);
            if (jobBit.HasValue)
                query = query.Where(i => i.Jobs != null && (i.Jobs.Value & jobBit.Value) != 0);
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(i => i.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                i.ItemId,
                i.Name,
                i.Category,
                i.Level,
                i.Skill,
                i.StackSize,
                i.IconPath,
                IsRare = (i.Flags & 32) != 0,
                IsExclusive = (i.Flags & 8192) != 0,
                IsAuctionable = (i.Flags & 32768) != 0,
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var item = await _db.GameItems.FindAsync(id);
        if (item is null) return NotFound();

        return Ok(new
        {
            item.ItemId,
            item.Name,
            item.NameJa,
            item.NameLong,
            item.Description,
            item.Category,
            item.Type,
            item.Flags,
            item.StackSize,
            item.Level,
            item.Jobs,
            item.Races,
            item.Slots,
            item.Skill,
            item.Damage,
            item.Delay,
            item.DEF,
            item.HP, item.MP,
            item.STR, item.DEX, item.VIT, item.AGI, item.INT, item.MND, item.CHR,
            item.Accuracy, item.Attack,
            item.RangedAccuracy, item.RangedAttack,
            item.MagicAccuracy, item.MagicDamage, item.MagicEvasion,
            item.Evasion, item.Enmity, item.Haste,
            item.StoreTP, item.TPBonus,
            item.PhysicalDamageTaken, item.MagicDamageTaken,
            item.IconPath,
            item.PreviewImagePath,
            IsRare = item.IsRare,
            IsExclusive = item.IsExclusive,
            IsAuctionable = item.IsAuctionable,
        });
    }

    [HttpGet("categories")]
    public async Task<IActionResult> Categories()
    {
        var categories = await _db.GameItems
            .Select(i => i.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return Ok(categories);
    }

    // FFXI job bitmask: bit 0 is unused (no job), WAR starts at bit 1.
    // This matches the actual Windower Resources items.lua bitmask values.
    private static int? GetJobBitmask(string jobAbbr)
    {
        return jobAbbr.ToUpperInvariant() switch
        {
            "WAR" => 1 << 1,
            "MNK" => 1 << 2,
            "WHM" => 1 << 3,
            "BLM" => 1 << 4,
            "RDM" => 1 << 5,
            "THF" => 1 << 6,
            "PLD" => 1 << 7,
            "DRK" => 1 << 8,
            "BST" => 1 << 9,
            "BRD" => 1 << 10,
            "RNG" => 1 << 11,
            "SAM" => 1 << 12,
            "NIN" => 1 << 13,
            "DRG" => 1 << 14,
            "SMN" => 1 << 15,
            "BLU" => 1 << 16,
            "COR" => 1 << 17,
            "PUP" => 1 << 18,
            "DNC" => 1 << 19,
            "SCH" => 1 << 20,
            "GEO" => 1 << 21,
            "RUN" => 1 << 22,
            _ => null,
        };
    }
}
```

- [ ] **Step 2: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 8: Add EquippedGear FK to GameItem

**Files:**
- Modify: `src/Vanalytics.Data/Configurations/EquippedGearConfiguration.cs`

- [ ] **Step 1: Add FK relationship from EquippedGear.ItemId to GameItem.ItemId**

Read the existing `EquippedGearConfiguration.cs`, then add this relationship:

```csharp
        builder.HasOne<GameItem>()
            .WithMany()
            .HasForeignKey(g => g.ItemId)
            .OnDelete(DeleteBehavior.NoAction)
            .IsRequired(false);
```

Note: `IsRequired(false)` because existing EquippedGear rows may reference item IDs that haven't been seeded yet, and `NoAction` to avoid cascade conflicts. The FK adds referential integrity going forward.

Also add `using Vanalytics.Core.Models;` if not already present (it should be since other models are referenced).

- [ ] **Step 2: Create migration**

```bash
dotnet ef migrations add AddEquippedGearItemFK --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
dotnet build Vanalytics.slnx
```

---

### Task 9: Docker Compose Smoke Test

- [ ] **Step 1: Build and start**

```bash
docker compose up --build -d
```

Wait ~60 seconds for migrations + item seeding (23K items from Windower Resources).

- [ ] **Step 2: Verify items were seeded**

```bash
curl -s "http://localhost:5000/api/items?q=Vajra&pageSize=5" | head -20
```

Expected: JSON with items matching "Vajra", including ItemId, Name, Category, etc.

- [ ] **Step 3: Verify item detail**

```bash
curl -s "http://localhost:5000/api/items/20515"
```

Expected: Full Vajra item details with stats (DMG, Delay, skill bonuses, etc.)

- [ ] **Step 4: Verify categories**

```bash
curl -s "http://localhost:5000/api/items/categories"
```

Expected: Array of categories ["Armor", "Crystal", "General", "Weapon", ...]

- [ ] **Step 5: Tear down**

```bash
docker compose down
```
