using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;
using Soverance.Auth.Models;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Data.Tests;

public class SchemaTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder().Build();
    private VanalyticsDbContext _db = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var options = new DbContextOptionsBuilder<VanalyticsDbContext>()
            .UseSqlServer(_container.GetConnectionString())
            .Options;
        _db = new VanalyticsDbContext(options);
        await _db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task CanInsertAndRetrieveFullCharacterGraph()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Username = "testuser",
            PasswordHash = "hash",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Users.Add(user);

        var character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Soverance",
            Server = "Asura",
            IsPublic = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Characters.Add(character);

        _db.CharacterJobs.Add(new CharacterJob
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            JobId = JobType.THF,
            Level = 99,
            IsActive = true
        });

        _db.EquippedGear.Add(new EquippedGear
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Slot = EquipSlot.Main,
            ItemName = "Vajra",
            ItemId = 20515
        });

        _db.CraftingSkills.Add(new CraftingSkill
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Craft = CraftType.Goldsmithing,
            Level = 110,
            Rank = "Craftsman"
        });

        await _db.SaveChangesAsync();

        var loaded = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstAsync(c => c.Id == character.Id);

        Assert.Equal("Soverance", loaded.Name);
        Assert.Single(loaded.Jobs);
        Assert.Equal(JobType.THF, loaded.Jobs[0].JobId);
        Assert.Single(loaded.Gear);
        Assert.Equal("Vajra", loaded.Gear[0].ItemName);
        Assert.Single(loaded.CraftingSkills);
        Assert.Equal(CraftType.Goldsmithing, loaded.CraftingSkills[0].Craft);
    }

    [Fact]
    public async Task EnforcesUniqueCharacterNamePerServer()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "unique@example.com",
            Username = "uniqueuser",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        _db.Users.Add(user);

        _db.Characters.Add(new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Dupechar",
            Server = "Asura",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync();

        _db.Characters.Add(new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = "Dupechar",
            Server = "Asura",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
    }

    [Fact]
    public async Task EnforcesUniqueEmail()
    {
        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = "dupe@example.com",
            Username = "user1",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync();

        _db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = "dupe@example.com",
            Username = "user2",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _db.SaveChangesAsync());
    }
}
