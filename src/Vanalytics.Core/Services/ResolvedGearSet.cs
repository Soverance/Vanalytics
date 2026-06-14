// src/Vanalytics.Core/Services/ResolvedGearSet.cs
namespace Vanalytics.Core.Services;

/// <summary>A Gear Set with its slots fully resolved (name + augments), ready to emit.</summary>
public record ResolvedGearSet(long Id, string Name, IReadOnlyList<ResolvedSlot> Slots);

/// <summary>One slot: internal grid name (Main/Head/Ear1/…), item display name, augment strings.</summary>
public record ResolvedSlot(string Slot, int ItemId, string ItemName, IReadOnlyList<string> Augments);
