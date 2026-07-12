namespace Vanalytics.Core.DTOs.Analytics;

/// <summary>Headline counts for the Analytics tab stat cards, scoped by optional server.</summary>
public record AnalyticsSummary(int Characters, int Worlds, int JobsMastered, int UltimateWeapons);

/// <summary>One world's value for the selected server-comparison metric. Pre-sorted desc by the endpoint.</summary>
public record ServerComparisonEntry(string Server, double Value);

/// <summary>Count of characters for one job (either at level 99, or "mained"). Pre-sorted desc.</summary>
public record JobPopularityEntry(string Job, int Count);

/// <summary>Ownership of one ultimate weapon across the scope. Percent is 0–100, one decimal.</summary>
public record UltimateWeaponRarityEntry(string Weapon, string Category, int Owners, double Percent);
