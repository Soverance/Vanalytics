using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class AchievementRescoreRunnerGuardTests
{
    // Pure guard logic — no DB.
    [Fact]
    public void CanStart_WhenNoStateRow_ReturnsTrue() =>
        Assert.True(AchievementRescoreRunner.CanStart(null, DateTimeOffset.UtcNow));

    [Fact]
    public void CanStart_WhenNotRunning_ReturnsTrue()
    {
        var s = new AchievementRescoreState { IsRunning = false };
        Assert.True(AchievementRescoreRunner.CanStart(s, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void CanStart_WhenRunningWithFreshHeartbeat_ReturnsFalse()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState { IsRunning = true, HeartbeatAt = now };
        Assert.False(AchievementRescoreRunner.CanStart(s, now));
    }

    [Fact]
    public void CanStart_WhenRunningButHeartbeatStale_ReturnsTrue()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState
        {
            IsRunning = true,
            HeartbeatAt = now - AchievementRescoreRunner.StallThreshold - TimeSpan.FromSeconds(5)
        };
        Assert.True(AchievementRescoreRunner.CanStart(s, now));
    }

    [Fact]
    public void CanStart_WhenRunningWithNullHeartbeat_ReturnsTrue()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState { IsRunning = true, HeartbeatAt = null };
        Assert.True(AchievementRescoreRunner.CanStart(s, now));
    }

    [Fact]
    public void IsStalled_WhenRunningWithFreshHeartbeat_ReturnsFalse()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState { IsRunning = true, HeartbeatAt = now };
        Assert.False(AchievementRescoreRunner.IsStalled(s, now));
    }

    [Fact]
    public void IsStalled_WhenRunningWithStaleHeartbeat_ReturnsTrue()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState
        {
            IsRunning = true,
            HeartbeatAt = now - AchievementRescoreRunner.StallThreshold - TimeSpan.FromSeconds(5)
        };
        Assert.True(AchievementRescoreRunner.IsStalled(s, now));
    }

    [Fact]
    public void IsStalled_WhenRunningWithNullHeartbeat_ReturnsTrue()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState { IsRunning = true, HeartbeatAt = null };
        Assert.True(AchievementRescoreRunner.IsStalled(s, now));
    }

    [Fact]
    public void IsStalled_WhenNotRunning_ReturnsFalse()
    {
        var now = DateTimeOffset.UtcNow;
        var s = new AchievementRescoreState { IsRunning = false, HeartbeatAt = null };
        Assert.False(AchievementRescoreRunner.IsStalled(s, now));
    }
}

public class AchievementRescoreRunnerBatchTests : IAsyncLifetime
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

    // One character throwing must NOT abort the batch: Failed increments, the rest still Processed.
    [Fact]
    public async Task ExecuteBatchAsync_IsolatesPerCharacterFailures()
    {
        _db.AchievementRescoreStates.Add(new AchievementRescoreState { Id = 1, IsRunning = true });
        await _db.SaveChangesAsync();

        var ids = new List<Guid> { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };
        var bad = ids[1];

        await AchievementRescoreRunner.ExecuteBatchAsync(
            _db, ids,
            id => id == bad ? throw new InvalidOperationException("boom") : Task.CompletedTask,
            DateTimeOffset.UtcNow, CancellationToken.None);

        var state = await _db.AchievementRescoreStates.FirstAsync(s => s.Id == 1);
        Assert.Equal(3, state.Total);
        Assert.Equal(2, state.Processed);
        Assert.Equal(1, state.Failed);
        Assert.Equal("boom", state.LastError);
        Assert.NotNull(state.HeartbeatAt);
        Assert.NotNull(state.LastErrorAt);
    }
}
