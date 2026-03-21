using System.Text.RegularExpressions;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Services;

public static class ItemStatExtractor
{
    public static void ExtractStats(GameItem item, string? description)
    {
        if (string.IsNullOrEmpty(description)) return;

        item.DEF ??= ExtractStat(description, @"DEF[:\s]*([+-]?\d+)");
        item.HP ??= ExtractStat(description, @"(?<!\w)HP\s*([+-]?\d+)");
        item.MP ??= ExtractStat(description, @"(?<!\w)MP\s*([+-]?\d+)");
        item.STR ??= ExtractStat(description, @"(?<!\w)STR\s*([+-]?\d+)");
        item.DEX ??= ExtractStat(description, @"(?<!\w)DEX\s*([+-]?\d+)");
        item.VIT ??= ExtractStat(description, @"(?<!\w)VIT\s*([+-]?\d+)");
        item.AGI ??= ExtractStat(description, @"(?<!\w)AGI\s*([+-]?\d+)");
        item.INT ??= ExtractStat(description, @"(?<!\w)INT\s*([+-]?\d+)");
        item.MND ??= ExtractStat(description, @"(?<!\w)MND\s*([+-]?\d+)");
        item.CHR ??= ExtractStat(description, @"(?<!\w)CHR\s*([+-]?\d+)");
        item.Accuracy ??= ExtractStat(description, @"(?<!Ranged |Magic )Accuracy\s*([+-]?\d+)");
        item.Attack ??= ExtractStat(description, @"(?<!Ranged |Magic )Attack\s*([+-]?\d+)");
        item.RangedAccuracy ??= ExtractStat(description, @"Ranged Accuracy\s*([+-]?\d+)");
        item.RangedAttack ??= ExtractStat(description, @"Ranged Attack\s*([+-]?\d+)");
        item.MagicAccuracy ??= ExtractStat(description, @"Magic Accuracy\s*([+-]?\d+)");
        item.MagicDamage ??= ExtractStat(description, @"Magic Damage\s*([+-]?\d+)");
        item.MagicEvasion ??= ExtractStat(description, @"Magic Evasion\s*([+-]?\d+)");
        item.Evasion ??= ExtractStat(description, @"(?<!Magic )Evasion\s*([+-]?\d+)");
        item.Enmity ??= ExtractStat(description, @"Enmity\s*([+-]?\d+)");
        item.Haste ??= ExtractStat(description, @"Haste\s*([+-]?\d+)");
        item.StoreTP ??= ExtractStat(description, @"Store TP.*?([+-]?\d+)");
        item.TPBonus ??= ExtractStat(description, @"TP Bonus.*?([+-]?\d+)");
        item.PhysicalDamageTaken ??= ExtractStat(description, @"Physical [Dd]amage taken\s*([+-]?\d+)");
        item.MagicDamageTaken ??= ExtractStat(description, @"Magic [Dd]amage taken\s*([+-]?\d+)");
    }

    private static int? ExtractStat(string text, string pattern)
    {
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var value))
            return value;
        return null;
    }
}
