namespace Vanalytics.Core.DTOs.GearSets;

/// <summary>Commit payload. Reuses SaveGearSetRequest per set so the existing
/// slot-mapping / validation path applies. Sets are upserted by (character, job, name).</summary>
public class ImportCommitRequest
{
    public string? Job { get; set; }
    public List<SaveGearSetRequest> Sets { get; set; } = [];
}

public class ImportCommitResponse
{
    public int Created { get; set; }
    public int Updated { get; set; }
    public List<string> Names { get; set; } = [];
}
