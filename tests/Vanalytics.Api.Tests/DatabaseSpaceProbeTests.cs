using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests;

public class DatabaseSpaceStatusTests
{
    [Fact]
    public void BelowMinimum_IsLow() =>
        Assert.Equal("low", new DatabaseSpaceStatus(DatabaseSpaceStatus.MinFreeBytes - 1, 10).State);

    [Fact]
    public void AtOrAboveMinimum_IsOk() =>
        Assert.Equal("ok", new DatabaseSpaceStatus(DatabaseSpaceStatus.MinFreeBytes, 10).State);

    [Fact]
    public void UnknownFreeSpace_IsNotLow()
    {
        var s = new DatabaseSpaceStatus(null, null);
        Assert.False(s.IsLow);
        Assert.Equal("unknown", s.State);
    }
}

public class DatabaseSpaceProbeTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private VanalyticsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var opts = new DbContextOptionsBuilder<VanalyticsDbContext>()
            .UseSqlServer(_container.GetConnectionString()).Options;
        _db = new VanalyticsDbContext(opts);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task ReadsVolumeFreeSpaceAndLogUsage()
    {
        var s = await DatabaseSpaceProbe.CheckAsync(_db);

        Assert.NotNull(s.VolumeFreeBytes);
        Assert.True(s.VolumeFreeBytes > 0);
        Assert.NotNull(s.LogUsedPercent);
        Assert.InRange(s.LogUsedPercent!.Value, 0, 100);
    }
}
