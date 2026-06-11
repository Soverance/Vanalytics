using System.Text.Json;
using Microsoft.Data.SqlClient;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Data.Migrations;

namespace Vanalytics.Data.Tests;

public class GearSetSlotBackfillTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder().Build();
    private string _conn = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _conn = _container.GetConnectionString();
    }

    public async Task DisposeAsync() => await _container.DisposeAsync();

    [Fact]
    public async Task Backfill_flattens_real_serialized_slots_into_rows()
    {
        // Serialize EXACTLY as CharactersController does (default options => PascalCase).
        // If the OPENJSON paths and this casing ever diverge, this test fails.
        var slots = new List<GearSetSlotDto>
        {
            new() { Slot = "Main", ItemId = 18264, ItemName = "Mandau", Augments = [] },
            new() { Slot = "Legs", ItemId = 27932, ItemName = "Plun. Culottes +1",
                    Augments = ["Enhances \"Feint\" effect"] },
        };
        var slotsJson = JsonSerializer.Serialize(slots);

        await using var c = new SqlConnection(_conn);
        await c.OpenAsync();

        await Exec(c, "CREATE TABLE OldSets (Id bigint PRIMARY KEY, SlotsJson nvarchar(max) NOT NULL);");
        await Exec(c, @"CREATE TABLE GearSetSlots (
            Id bigint IDENTITY PRIMARY KEY, GearSetId bigint NOT NULL,
            Slot nvarchar(20) NOT NULL, ItemId int NOT NULL,
            ItemName nvarchar(100) NOT NULL, AugmentsJson nvarchar(max) NULL);");

        // Set 1: two slots (one augmented). Set 2: empty array (no rows expected).
        await Exec(c, "INSERT INTO OldSets (Id, SlotsJson) VALUES (1, @j), (2, N'[]');",
            ("@j", slotsJson));

        await Exec(c, GearSetSlotBackfill.BuildInsertSql("OldSets", "GearSetSlots"));

        // Assert: exactly 2 rows, both for set 1.
        Assert.Equal(2, await Scalar(c, "SELECT COUNT(*) FROM GearSetSlots;"));
        Assert.Equal(2, await Scalar(c, "SELECT COUNT(*) FROM GearSetSlots WHERE GearSetId = 1;"));

        // Main: no augments -> NULL AugmentsJson, ItemName preserved.
        Assert.Equal(1, await Scalar(c,
            "SELECT COUNT(*) FROM GearSetSlots WHERE Slot='Main' AND ItemId=18264 AND ItemName=N'Mandau' AND AugmentsJson IS NULL;"));
        // Legs: augment array preserved as JSON.
        Assert.Equal(1, await Scalar(c,
            "SELECT COUNT(*) FROM GearSetSlots WHERE Slot='Legs' AND ItemId=27932 AND AugmentsJson IS NOT NULL AND AugmentsJson LIKE N'%Feint%';"));
    }

    private static async Task Exec(SqlConnection c, string sql, params (string, object)[] ps)
    {
        await using var cmd = new SqlCommand(sql, c);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<int> Scalar(SqlConnection c, string sql)
    {
        await using var cmd = new SqlCommand(sql, c);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }
}
