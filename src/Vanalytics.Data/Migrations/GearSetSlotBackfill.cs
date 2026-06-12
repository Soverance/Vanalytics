namespace Vanalytics.Data.Migrations;

/// <summary>
/// Builds the one-time backfill that flattens the legacy CharacterGearSet.SlotsJson blob
/// into GearSetSlot rows. JSON keys are PascalCase and case-sensitive (slots were serialized
/// with default System.Text.Json options); OPENJSON paths match exactly.
/// Single-sourced so the migration and its test run the identical transform.
/// </summary>
public static class GearSetSlotBackfill
{
    /// <param name="sourceTable">table holding (Id bigint, SlotsJson nvarchar(max))</param>
    /// <param name="targetTable">GearSetSlots-shaped table (GearSetId, Slot, ItemId, ItemName, AugmentsJson)</param>
    public static string BuildInsertSql(string sourceTable, string targetTable) => $@"
INSERT INTO {targetTable} (GearSetId, Slot, ItemId, ItemName, AugmentsJson)
SELECT s.Id,
       j.Slot,
       j.ItemId,
       ISNULL(j.ItemName, N''),
       CASE WHEN j.Augments IS NULL OR j.Augments = N'[]' THEN NULL ELSE j.Augments END
FROM {sourceTable} AS s
CROSS APPLY OPENJSON(s.SlotsJson)
    WITH (
        Slot     nvarchar(20)   '$.Slot',
        ItemId   int            '$.ItemId',
        ItemName nvarchar(100)  '$.ItemName',
        Augments nvarchar(max)  '$.Augments' AS JSON
    ) AS j
WHERE j.ItemId IS NOT NULL;";
}
