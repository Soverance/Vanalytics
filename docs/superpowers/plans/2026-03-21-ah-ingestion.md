# AH Transaction Ingestion Implementation Plan (Sub-spec A2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AH transaction data model, economy rate limiter, ingestion API endpoint, price history/cross-server API endpoints, and addon AH packet capture.

**Architecture:** AuctionSale model with dedup unique constraint, separate EconomyRateLimiter (120 req/hr), ingestion endpoint with server name resolution, price aggregation queries, and Windower addon packet listener for AH history packets.

**Tech Stack:** .NET 10, EF Core, existing API key auth, Lua (Windower addon).

**Spec:** `docs/specs/2026-03-21-economy-tracking-design.md` — Sub-spec A, AH Transaction Ingestion section

**Depends on:** Plan A1 (Item Database) — GameItem and GameServer tables must exist.

---

## File Structure

```
src/
├── Vanalytics.Core/
│   ├── Models/
│   │   └── AuctionSale.cs                       # CREATE
│   └── DTOs/
│       └── Economy/
│           ├── AhIngestionRequest.cs             # CREATE
│           └── AhIngestionResponse.cs            # CREATE
├── Vanalytics.Data/
│   ├── VanalyticsDbContext.cs                    # MODIFY: add AuctionSales DbSet
│   ├── Configurations/
│   │   └── AuctionSaleConfiguration.cs           # CREATE
│   └── Migrations/                               # CREATE: new migration
├── Vanalytics.Api/
│   ├── Program.cs                                # MODIFY: register EconomyRateLimiter
│   ├── Services/
│   │   └── EconomyRateLimiter.cs                 # CREATE: 120 req/hr separate pool
│   └── Controllers/
│       └── EconomyController.cs                  # CREATE: AH ingestion + price endpoints
addon/
└── vanalytics/
    └── vanalytics.lua                            # MODIFY: add AH packet listener
```

---

### Task 1: AuctionSale Model, EF Configuration, and Migration

**Files:**
- Create: `src/Vanalytics.Core/Models/AuctionSale.cs`
- Create: `src/Vanalytics.Data/Configurations/AuctionSaleConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create AuctionSale model**

```csharp
// src/Vanalytics.Core/Models/AuctionSale.cs
namespace Vanalytics.Core.Models;

public class AuctionSale
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public int ServerId { get; set; }
    public int Price { get; set; }
    public DateTimeOffset SoldAt { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public string BuyerName { get; set; } = string.Empty;
    public int StackSize { get; set; } = 1;
    public Guid ReportedByUserId { get; set; }
    public DateTimeOffset ReportedAt { get; set; }

    public GameItem Item { get; set; } = null!;
    public GameServer Server { get; set; } = null!;
    public User ReportedBy { get; set; } = null!;
}
```

- [ ] **Step 2: Create AuctionSaleConfiguration**

```csharp
// src/Vanalytics.Data/Configurations/AuctionSaleConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class AuctionSaleConfiguration : IEntityTypeConfiguration<AuctionSale>
{
    public void Configure(EntityTypeBuilder<AuctionSale> builder)
    {
        builder.HasKey(s => s.Id);

        // Dedup constraint
        builder.HasIndex(s => new { s.ItemId, s.ServerId, s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .IsUnique();

        // Query indexes
        builder.HasIndex(s => new { s.ItemId, s.ServerId, s.SoldAt });
        builder.HasIndex(s => new { s.ServerId, s.SoldAt });

        builder.Property(s => s.SellerName).HasMaxLength(64).IsRequired();
        builder.Property(s => s.BuyerName).HasMaxLength(64).IsRequired();

        builder.HasOne(s => s.Item)
            .WithMany()
            .HasForeignKey(s => s.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.Server)
            .WithMany()
            .HasForeignKey(s => s.ServerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.ReportedBy)
            .WithMany()
            .HasForeignKey(s => s.ReportedByUserId)
            .OnDelete(DeleteBehavior.NoAction);
    }
}
```

- [ ] **Step 3: Add AuctionSales DbSet**

Add to `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
public DbSet<AuctionSale> AuctionSales => Set<AuctionSale>();
```

- [ ] **Step 4: Create migration and verify build**

```bash
dotnet build Vanalytics.slnx
dotnet ef migrations add AddAuctionSales --project src/Vanalytics.Data --startup-project src/Vanalytics.Api
dotnet build Vanalytics.slnx
```

---

### Task 2: Economy Rate Limiter

**Files:**
- Create: `src/Vanalytics.Api/Services/EconomyRateLimiter.cs`
- Modify: `src/Vanalytics.Api/Program.cs`

- [ ] **Step 1: Create EconomyRateLimiter**

Separate rate limiter with 120 req/hr for economy ingestion endpoints.

```csharp
// src/Vanalytics.Api/Services/EconomyRateLimiter.cs
namespace Vanalytics.Api.Services;

public class EconomyRateLimiter : RateLimiter
{
    public EconomyRateLimiter() : base(maxRequests: 120, window: TimeSpan.FromHours(1))
    {
    }
}
```

- [ ] **Step 2: Register in Program.cs**

Add after the existing `RateLimiter` registration:

```csharp
builder.Services.AddSingleton<EconomyRateLimiter>();
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 3: AH Ingestion DTOs and API Endpoint

**Files:**
- Create: `src/Vanalytics.Core/DTOs/Economy/AhIngestionRequest.cs`
- Create: `src/Vanalytics.Core/DTOs/Economy/AhIngestionResponse.cs`
- Create: `src/Vanalytics.Api/Controllers/EconomyController.cs`

- [ ] **Step 1: Create DTOs**

```csharp
// src/Vanalytics.Core/DTOs/Economy/AhIngestionRequest.cs
using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Economy;

public class AhIngestionRequest
{
    [Required]
    public int ItemId { get; set; }

    [Required]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<AhSaleEntry> Sales { get; set; } = [];
}

public class AhSaleEntry
{
    public int Price { get; set; }
    public DateTimeOffset SoldAt { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public string BuyerName { get; set; } = string.Empty;
    public int StackSize { get; set; } = 1;
}
```

```csharp
// src/Vanalytics.Core/DTOs/Economy/AhIngestionResponse.cs
namespace Vanalytics.Core.DTOs.Economy;

public class AhIngestionResponse
{
    public int Accepted { get; set; }
    public int Duplicates { get; set; }
}
```

- [ ] **Step 2: Create EconomyController**

```csharp
// src/Vanalytics.Api/Controllers/EconomyController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Economy;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/economy")]
public class EconomyController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly EconomyRateLimiter _rateLimiter;

    public EconomyController(VanalyticsDbContext db, EconomyRateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost("ah")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestAh([FromBody] AhIngestionRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Rate limit
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        // Resolve server
        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        // Verify item exists
        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == request.ItemId);
        if (!itemExists)
            return BadRequest(new { message = $"Unknown item ID: {request.ItemId}" });

        var now = DateTimeOffset.UtcNow;
        var accepted = 0;
        var duplicates = 0;

        // Batch dedup: preload existing matching records in one query
        var candidateKeys = request.Sales.Select(s => new { request.ItemId, ServerId = server.Id, s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize }).ToList();

        var existingSales = await _db.AuctionSales
            .Where(s => s.ItemId == request.ItemId && s.ServerId == server.Id)
            .Where(s => candidateKeys.Select(c => c.SoldAt).Contains(s.SoldAt))
            .Select(s => new { s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .ToListAsync();

        var existingSet = existingSales.ToHashSet();

        foreach (var sale in request.Sales)
        {
            var key = new { sale.Price, sale.SoldAt, sale.BuyerName, sale.SellerName, sale.StackSize };
            if (existingSet.Contains(key))
            {
                duplicates++;
                continue;
            }

            _db.AuctionSales.Add(new AuctionSale
            {
                ItemId = request.ItemId,
                ServerId = server.Id,
                Price = sale.Price,
                SoldAt = sale.SoldAt,
                SellerName = sale.SellerName,
                BuyerName = sale.BuyerName,
                StackSize = sale.StackSize,
                ReportedByUserId = userId,
                ReportedAt = now,
            });

            accepted++;
        }

        if (accepted > 0)
            await _db.SaveChangesAsync();

        return Ok(new AhIngestionResponse { Accepted = accepted, Duplicates = duplicates });
    }
}
```

- [ ] **Step 3: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 4: Price History and Cross-Server Endpoints

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ItemsController.cs`

- [ ] **Step 1: Add price endpoints to ItemsController**

Add these two methods to the existing `ItemsController`:

```csharp
    [HttpGet("{id:int}/prices")]
    public async Task<IActionResult> Prices(
        int id,
        [FromQuery] string? server = null,
        [FromQuery] int days = 30,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (days > 365) days = 365;
        if (pageSize > 100) pageSize = 100;

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var since = DateTimeOffset.UtcNow.AddDays(-days);
        var query = _db.AuctionSales
            .Where(s => s.ItemId == id && s.SoldAt >= since);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(s => s.ServerId == srv.Id);
        }

        var totalCount = await query.CountAsync();

        // Aggregates — compute in DB where possible, median in memory
        var aggQuery = query.Select(s => s.Price);
        var count = await aggQuery.CountAsync();

        object? stats = null;
        double salesPerDay = 0;

        if (count > 0)
        {
            var min = await aggQuery.MinAsync();
            var max = await aggQuery.MaxAsync();
            var avg = (int)await aggQuery.AverageAsync();

            // Median via sorted prices in memory (efficient for typical result sets)
            var sortedPrices = await query.OrderBy(s => s.Price).Select(s => s.Price).ToListAsync();
            var median = sortedPrices[sortedPrices.Count / 2];

            salesPerDay = days > 0 ? Math.Round((double)count / days, 2) : 0;

            stats = new { Median = median, Min = min, Max = max, Average = avg, SalesPerDay = salesPerDay };
        }

        var sales = await query
            .OrderByDescending(s => s.SoldAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new
            {
                s.Price,
                s.SoldAt,
                s.SellerName,
                s.BuyerName,
                s.StackSize,
            })
            .ToListAsync();

        return Ok(new
        {
            totalCount,
            page,
            pageSize,
            days,
            stats = stats != null ? new { stats.Median, stats.Min, stats.Max, stats.Average, salesPerDay } : null,
            sales,
        });
    }

    [HttpGet("{id:int}/prices/all")]
    public async Task<IActionResult> CrossServerPrices(int id, [FromQuery] int days = 30)
    {
        if (days > 365) days = 365;

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var since = DateTimeOffset.UtcNow.AddDays(-days);

        // Group by server, compute aggregates in memory for median support
        var rawSales = await _db.AuctionSales
            .Where(s => s.ItemId == id && s.SoldAt >= since)
            .Select(s => new { ServerName = s.Server.Name, s.Price })
            .ToListAsync();

        var serverPrices = rawSales
            .GroupBy(s => s.ServerName)
            .Select(g =>
            {
                var sorted = g.OrderBy(s => s.Price).Select(s => s.Price).ToList();
                return new
                {
                    Server = g.Key,
                    Median = sorted[sorted.Count / 2],
                    Min = sorted[0],
                    Max = sorted[^1],
                    Average = (int)sorted.Average(),
                    SaleCount = sorted.Count,
                };
            })
            .OrderBy(s => s.Server)
            .ToList();

        return Ok(new { days, servers = serverPrices });
    }
```

Note: This requires adding `using Microsoft.EntityFrameworkCore;` if not already present, and the `_db` field must also expose `AuctionSales` (already added via DbContext).

- [ ] **Step 2: Verify build**

```bash
dotnet build Vanalytics.slnx
```

---

### Task 5: Addon AH Packet Capture

**Files:**
- Modify: `addon/vanalytics/vanalytics.lua`

- [ ] **Step 1: Add AH packet listener to the addon**

Read the existing `addon/vanalytics/vanalytics.lua`, then add this section before the `-- Chat commands` section:

```lua
-----------------------------------------------------------------------
-- AH History Packet Capture (packet 0x0E7)
-----------------------------------------------------------------------
windower.register_event('incoming chunk', function(id, data)
    if id ~= 0x0E7 then return end
    if settings.ApiKey == '' then return end

    local player = windower.ffxi.get_player()
    if not player then return end

    local info = windower.ffxi.get_info()
    local server = res.servers[info.server] and res.servers[info.server].en or 'Unknown'

    -- Parse AH history packet
    -- Packet structure (0x0E7): item ID at offset 0x04 (2 bytes)
    -- Each sale entry is 16 bytes starting at offset 0x08
    -- Entry: price (4 bytes), date (4 bytes), seller name, buyer name
    local item_id = data:byte(5) + data:byte(6) * 256

    if item_id == 0 then return end

    local sales = {}
    local offset = 9 -- 1-indexed in Lua
    local entry_size = 16

    while offset + entry_size - 1 <= #data do
        local price = data:byte(offset) + data:byte(offset + 1) * 256 +
                       data:byte(offset + 2) * 65536 + data:byte(offset + 3) * 16777216

        if price == 0 then break end

        -- Date is a Unix timestamp (4 bytes)
        local timestamp = data:byte(offset + 4) + data:byte(offset + 5) * 256 +
                          data:byte(offset + 6) * 65536 + data:byte(offset + 7) * 16777216

        local seller_name = ''
        local buyer_name = ''

        -- Extract names from remaining bytes (implementation depends on exact packet format)
        -- This is a simplified extraction; actual packet format may vary
        for i = offset + 8, math.min(offset + entry_size - 1, #data) do
            local b = data:byte(i)
            if b == 0 then break end
            buyer_name = buyer_name .. string.char(b)
        end

        table.insert(sales, {
            price = price,
            soldAt = os.date('!%Y-%m-%dT%H:%M:%SZ', timestamp),
            sellerName = seller_name,
            buyerName = buyer_name,
            stackSize = 1,
        })

        offset = offset + entry_size
    end

    if #sales == 0 then return end

    -- Submit to API
    local payload = json_encode({
        itemId = item_id,
        server = server,
        sales = sales,
    })

    local url = settings.ApiUrl .. '/api/economy/ah'

    local http = require('socket.http')
    local ltn12 = require('ltn12')
    http.TIMEOUT = 5

    local response_body = {}
    local result, status_code = http.request({
        url = url,
        method = 'POST',
        headers = {
            ['Content-Type'] = 'application/json',
            ['Content-Length'] = tostring(#payload),
            ['X-Api-Key'] = settings.ApiKey,
        },
        source = ltn12.source.string(payload),
        sink = ltn12.sink.table(response_body),
    })

    if result and status_code == 200 then
        log('AH data submitted: ' .. #sales .. ' sales for item ' .. item_id)
    elseif status_code == 429 then
        log_error('Economy rate limit exceeded')
    end
end)
```

> **IMPORTANT: This is a skeleton implementation.** The AH history packet (0x0E7) structure shown above uses placeholder byte offsets. The actual packet has ~52 bytes per sale entry with separate fields for buyer name (~16 bytes), seller name (~16 bytes), price (4 bytes), date (4 bytes), and stack flag. The exact offsets MUST be verified in-game using Windower's packet viewer or community packet documentation (e.g., the PacketViewer addon or FFXI packet wikis) before this code will produce usable data. Do not consider this task complete until packet offsets are verified with the actual game client.

- [ ] **Step 2: Verify the Lua file has no syntax errors**

```bash
lua -e "loadfile('addon/vanalytics/vanalytics.lua')" 2>&1 || echo "Manual review only"
```

---

### Task 6: Integration Test for AH Ingestion

**Files:**
- Create: `tests/Vanalytics.Api.Tests/Controllers/EconomyControllerTests.cs`

- [ ] **Step 1: Write integration tests**

```csharp
// tests/Vanalytics.Api.Tests/Controllers/EconomyControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Auth;
using Vanalytics.Core.DTOs.Economy;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class EconomyControllerTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7",
                    });
                });
            });
        _client = _factory.CreateClient();

        // Seed a test item and server
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.GameItems.Add(new GameItem
        {
            ItemId = 4096,
            Name = "Fire Crystal",
            Category = "Crystal",
            StackSize = 12,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        db.GameServers.Add(new GameServer
        {
            Name = "Asura",
            Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private async Task<string> GetApiKeyAsync()
    {
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = "econ@test.com", Username = "econuser", Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        return (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;
    }

    [Fact]
    public async Task IngestAh_AcceptsSales()
    {
        var apiKey = await GetApiKeyAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales =
            [
                new AhSaleEntry
                {
                    Price = 2000,
                    SoldAt = DateTimeOffset.UtcNow.AddHours(-1),
                    SellerName = "SellerA",
                    BuyerName = "BuyerB",
                    StackSize = 1,
                }
            ],
        });

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var result = await resp.Content.ReadFromJsonAsync<AhIngestionResponse>();
        Assert.Equal(1, result!.Accepted);
        Assert.Equal(0, result.Duplicates);
    }

    [Fact]
    public async Task IngestAh_DeduplicatesSales()
    {
        var apiKey = await GetApiKeyAsync();
        var soldAt = DateTimeOffset.UtcNow.AddHours(-2);

        var payload = new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales =
            [
                new AhSaleEntry { Price = 3000, SoldAt = soldAt, SellerName = "S", BuyerName = "B", StackSize = 1 }
            ],
        };

        // First submission
        var req1 = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req1.Headers.Add("X-Api-Key", apiKey);
        req1.Content = JsonContent.Create(payload);
        await _client.SendAsync(req1);

        // Second submission (duplicate)
        var req2 = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req2.Headers.Add("X-Api-Key", apiKey);
        req2.Content = JsonContent.Create(payload);
        var resp = await _client.SendAsync(req2);

        var result = await resp.Content.ReadFromJsonAsync<AhIngestionResponse>();
        Assert.Equal(0, result!.Accepted);
        Assert.Equal(1, result.Duplicates);
    }

    [Fact]
    public async Task IngestAh_WithoutApiKey_ReturnsUnauthorized()
    {
        var resp = await _client.PostAsJsonAsync("/api/economy/ah", new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "Asura",
            Sales = [],
        });
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task IngestAh_UnknownServer_ReturnsBadRequest()
    {
        var apiKey = await GetApiKeyAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/economy/ah");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(new AhIngestionRequest
        {
            ItemId = 4096,
            Server = "FakeServer",
            Sales = [new AhSaleEntry { Price = 100, SoldAt = DateTimeOffset.UtcNow, SellerName = "S", BuyerName = "B" }],
        });

        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests**

```bash
dotnet test tests/Vanalytics.Api.Tests/ --filter "EconomyControllerTests" -v normal
```

Expected: All 4 tests pass.

---

### Task 7: Docker Compose Smoke Test

- [ ] **Step 1: Start stack and verify AH ingestion**

```bash
docker compose up --build -d
sleep 30

# Register user, get API key
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"ahtest@test.com\",\"username\":\"ahuser\",\"password\":\"TestPass123!\"}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

APIKEY=$(curl -s -X POST http://localhost:5000/api/keys/generate \
  -H "Authorization: Bearer $TOKEN" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)

# Submit AH data
curl -s -X POST http://localhost:5000/api/economy/ah \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $APIKEY" \
  -d "{\"itemId\":4096,\"server\":\"Asura\",\"sales\":[{\"price\":2000,\"soldAt\":\"2026-03-20T12:00:00Z\",\"sellerName\":\"Seller\",\"buyerName\":\"Buyer\",\"stackSize\":1}]}"
```

Expected: `{"accepted":1,"duplicates":0}`

- [ ] **Step 2: Query price history**

```bash
curl -s "http://localhost:5000/api/items/4096/prices?server=Asura"
```

Expected: JSON with stats and sales array.

- [ ] **Step 3: Tear down**

```bash
docker compose down
```
