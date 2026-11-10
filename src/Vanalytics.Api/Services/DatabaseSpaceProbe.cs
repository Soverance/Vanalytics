using Microsoft.EntityFrameworkCore;

namespace Vanalytics.Api.Services;

/// <summary>
/// Free space on the volume holding the database files, plus transaction log usage.
/// A null value means SQL Server didn't answer (e.g. missing VIEW SERVER STATE permission).
/// </summary>
public sealed record DatabaseSpaceStatus(long? VolumeFreeBytes, double? LogUsedPercent)
{
    // Below this, SQL Server can't grow its files and every write starts failing
    // (2026-11-10: a full disk caused error 9002 on all writes while /health said "healthy").
    public const long MinFreeBytes = 2L * 1024 * 1024 * 1024;

    public bool IsLow => VolumeFreeBytes is < MinFreeBytes;

    public string State => VolumeFreeBytes is null ? "unknown" : IsLow ? "low" : "ok";
}

/// <summary>
/// Read-only check of database disk space for /health. Uses SQL Server's own views,
/// so it sees the volume as the database engine does (inside the mssql container).
/// </summary>
public static class DatabaseSpaceProbe
{
    public static async Task<DatabaseSpaceStatus> CheckAsync(DbContext db, CancellationToken ct = default)
    {
        long? free = null;
        double? logUsed = null;

        try
        {
            free = await db.Database.SqlQueryRaw<long?>(
                    """
                    SELECT MIN(CAST(vs.available_bytes AS bigint)) AS [Value]
                    FROM sys.database_files f
                    CROSS APPLY sys.dm_os_volume_stats(DB_ID(), f.file_id) vs
                    """)
                .SingleAsync(ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            // Unknown, not unhealthy: a permissions gap shouldn't take the app out of rotation.
        }

        try
        {
            logUsed = await db.Database.SqlQueryRaw<double?>(
                    "SELECT CAST(used_log_space_in_percent AS float) AS [Value] FROM sys.dm_db_log_space_usage")
                .SingleAsync(ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
        }

        return new DatabaseSpaceStatus(free, logUsed);
    }
}
