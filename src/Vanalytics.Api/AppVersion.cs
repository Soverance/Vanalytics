using System.Reflection;

namespace Vanalytics.Api;

/// <summary>
/// Single source of truth for the running application version. Mirrors the
/// value the deploy pipeline stamps via <c>APP_VERSION</c> into the assembly's
/// informational version. Consumed by the <c>/health</c> endpoint and the
/// addon self-update manifest so a stale build and a fresh manifest can never
/// disagree.
/// </summary>
public static class AppVersion
{
    public static string Current { get; } =
        typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(Program).Assembly.GetName().Version?.ToString()
        ?? "unknown";
}
