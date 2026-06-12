namespace Vanalytics.Core.Enums;

public static class JobTypeExtensions
{
    /// <summary>
    /// Converts the 0-based <see cref="JobType"/> enum (WAR = 0, ... SMN = 14,
    /// BLU = 15) to FFXI's canonical 1-based job id (WAR = 1, ... SMN = 15,
    /// BLU = 16). The web client's JOB_NAMES table is 1-based, so any numeric
    /// job id exposed to the frontend MUST go through here — casting the enum
    /// directly leaks the 0-based value and renders every job one slot off.
    /// </summary>
    public static int ToFfxiJobId(this JobType job) => (int)job + 1;
}
