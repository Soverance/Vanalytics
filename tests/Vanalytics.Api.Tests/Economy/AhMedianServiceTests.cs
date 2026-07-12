using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Economy;

public class AhMedianServiceTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private VanalyticsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var opts = new DbContextOptionsBuilder<VanalyticsDbContext>()
            .UseSqlServer(_container.GetConnectionString()).Options;
        _db = new VanalyticsDbContext(opts);
        await _db.Database.EnsureCreatedAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task GetMediansAsync_SplitsSingleAndStackMedians()
    {
        var now = DateTimeOffset.UtcNow;

        // Seed FK parent rows first.
        var server1 = new GameServer { Name = "Server1", Status = ServerStatus.Online, LastCheckedAt = now, CreatedAt = now };
        var server2 = new GameServer { Name = "Server2", Status = ServerStatus.Online, LastCheckedAt = now, CreatedAt = now };
        _db.GameServers.AddRange(server1, server2);
        _db.GameItems.Add(new GameItem { ItemId = 42, Name = "TestItem", Category = "Usable", StackSize = 12, CreatedAt = now, UpdatedAt = now });
        await _db.SaveChangesAsync();

        // Single sales: 100, 200, 300 -> median 200. Stack sales: 1000, 2000 -> median 1500.
        _db.AuctionSales.AddRange(
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 100, StackSize = 1, SoldAt = now.AddDays(-1), SellerName = "S", BuyerName = "B", ObservedAt = now },
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 200, StackSize = 1, SoldAt = now.AddDays(-2), SellerName = "S", BuyerName = "B", ObservedAt = now },
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 300, StackSize = 1, SoldAt = now.AddDays(-3), SellerName = "S", BuyerName = "B", ObservedAt = now },
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 1000, StackSize = 12, SoldAt = now.AddDays(-4), SellerName = "S", BuyerName = "B", ObservedAt = now },
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 2000, StackSize = 12, SoldAt = now.AddDays(-5), SellerName = "S", BuyerName = "B", ObservedAt = now },
            // Different server — must be excluded.
            new AuctionSale { ServerId = server2.Id, ItemId = 42, Price = 99999, StackSize = 1, SoldAt = now.AddDays(-1), SellerName = "S", BuyerName = "B", ObservedAt = now },
            // Outside the 30-day window — must be excluded.
            new AuctionSale { ServerId = server1.Id, ItemId = 42, Price = 88888, StackSize = 1, SoldAt = now.AddDays(-40), SellerName = "S", BuyerName = "B", ObservedAt = now }
        );
        await _db.SaveChangesAsync();

        var result = await AhMedianService.GetMediansAsync(_db, serverId: server1.Id, itemIds: new[] { 42 });

        Assert.True(result.ContainsKey(42));
        var m = result[42];
        Assert.Equal(200, m.SingleMedian);
        Assert.Equal(3, m.SingleCount);
        Assert.Equal(1500, m.StackMedian);
        Assert.Equal(2, m.StackCount);
    }

    [Fact]
    public async Task GetMediansAsync_EmptyItemIds_ReturnsEmpty()
    {
        var result = await AhMedianService.GetMediansAsync(_db, 1, Array.Empty<int>());
        Assert.Empty(result);
    }
}
