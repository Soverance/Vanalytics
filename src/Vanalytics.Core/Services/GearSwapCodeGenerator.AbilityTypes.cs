// src/Vanalytics.Core/Services/GearSwapCodeGenerator.AbilityTypes.cs
// Name -> GearSwap spell.type for /jobability abilities whose type is NOT the generic "JobAbility".
// These actions (DNC Waltz/Samba/Step/Jig/Flourish, COR rolls/quick draw, RUN runes/wards/effusions,
// SCH stratagems) report their own spell.type in GearSwap, so a precast JobAbility arm guarded solely
// by `spell.type == 'JobAbility'` never fires for them. EmitEvents unions these types into the guard.
//
// Source: Windower Resources job_abilities.lua (entries with prefix="/jobability" and type != "JobAbility").
// Regenerate with:
//   curl -s https://raw.githubusercontent.com/Windower/Resources/master/resources_data/job_abilities.lua \
//     | grep -oE 'en="[^"]*"[^}]*prefix="/jobability"[^}]*type="[^"]*"' \
//     | sed -E 's/en="([^"]*)".*type="([^"]*)"/\2\t\1/' | grep -vP '^JobAbility\t' | sort -t$'\t' -k2

using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Keyed by exact ability english name (ordinal), matching the leaf's ActionName / spell.english.
    private static readonly IReadOnlyDictionary<string, string> AbilitySubTypes = new Dictionary<string, string>(System.StringComparer.Ordinal)
    {
        ["Accession"] = "Scholar",
        ["Addendum: Black"] = "Scholar",
        ["Addendum: White"] = "Scholar",
        ["Alacrity"] = "Scholar",
        ["Allies' Roll"] = "CorsairRoll",
        ["Altruism"] = "Scholar",
        ["Animated Flourish"] = "Flourish1",
        ["Aspir Samba"] = "Samba",
        ["Aspir Samba II"] = "Samba",
        ["Avenger's Roll"] = "CorsairRoll",
        ["Battuta"] = "Ward",
        ["Beast Roll"] = "CorsairRoll",
        ["Blitzer's Roll"] = "CorsairRoll",
        ["Bolter's Roll"] = "CorsairRoll",
        ["Box Step"] = "Step",
        ["Building Flourish"] = "Flourish2",
        ["Caster's Roll"] = "CorsairRoll",
        ["Celerity"] = "Scholar",
        ["Chaos Roll"] = "CorsairRoll",
        ["Chocobo Jig"] = "Jig",
        ["Chocobo Jig II"] = "Jig",
        ["Choral Roll"] = "CorsairRoll",
        ["Climactic Flourish"] = "Flourish3",
        ["Companion's Roll"] = "CorsairRoll",
        ["Corsair's Roll"] = "CorsairRoll",
        ["Courser's Roll"] = "CorsairRoll",
        ["Curing Waltz"] = "Waltz",
        ["Curing Waltz II"] = "Waltz",
        ["Curing Waltz III"] = "Waltz",
        ["Curing Waltz IV"] = "Waltz",
        ["Curing Waltz V"] = "Waltz",
        ["Dancer's Roll"] = "CorsairRoll",
        ["Dark Shot"] = "CorsairShot",
        ["Desperate Flourish"] = "Flourish1",
        ["Divine Waltz"] = "Waltz",
        ["Divine Waltz II"] = "Waltz",
        ["Drachen Roll"] = "CorsairRoll",
        ["Drain Samba"] = "Samba",
        ["Drain Samba II"] = "Samba",
        ["Drain Samba III"] = "Samba",
        ["Earth Shot"] = "CorsairShot",
        ["Ebullience"] = "Scholar",
        ["Equanimity"] = "Scholar",
        ["Evoker's Roll"] = "CorsairRoll",
        ["Feather Step"] = "Step",
        ["Fighter's Roll"] = "CorsairRoll",
        ["Fire Shot"] = "CorsairShot",
        ["Flabra"] = "Rune",
        ["Focalization"] = "Scholar",
        ["Gallant's Roll"] = "CorsairRoll",
        ["Gambit"] = "Effusion",
        ["Gelus"] = "Rune",
        ["Haste Samba"] = "Samba",
        ["Healer's Roll"] = "CorsairRoll",
        ["Healing Waltz"] = "Waltz",
        ["Hunter's Roll"] = "CorsairRoll",
        ["Ice Shot"] = "CorsairShot",
        ["Ignis"] = "Rune",
        ["Immanence"] = "Scholar",
        ["Liement"] = "Ward",
        ["Light Shot"] = "CorsairShot",
        ["Lunge"] = "Effusion",
        ["Lux"] = "Rune",
        ["Magus's Roll"] = "CorsairRoll",
        ["Manifestation"] = "Scholar",
        ["Miser's Roll"] = "CorsairRoll",
        ["Monk's Roll"] = "CorsairRoll",
        ["Naturalist's Roll"] = "CorsairRoll",
        ["Ninja Roll"] = "CorsairRoll",
        ["Parsimony"] = "Scholar",
        ["Penury"] = "Scholar",
        ["Perpetuance"] = "Scholar",
        ["Pflug"] = "Ward",
        ["Puppet Roll"] = "CorsairRoll",
        ["Quickstep"] = "Step",
        ["Rapture"] = "Scholar",
        ["Rayke"] = "Effusion",
        ["Reverse Flourish"] = "Flourish2",
        ["Rogue's Roll"] = "CorsairRoll",
        ["Runeist's Roll"] = "CorsairRoll",
        ["Samurai Roll"] = "CorsairRoll",
        ["Scholar's Roll"] = "CorsairRoll",
        ["Spectral Jig"] = "Jig",
        ["Striking Flourish"] = "Flourish3",
        ["Stutter Step"] = "Step",
        ["Sulpor"] = "Rune",
        ["Swipe"] = "Effusion",
        ["Tactician's Roll"] = "CorsairRoll",
        ["Tellus"] = "Rune",
        ["Tenebrae"] = "Rune",
        ["Ternary Flourish"] = "Flourish3",
        ["Thunder Shot"] = "CorsairShot",
        ["Tranquility"] = "Scholar",
        ["Unda"] = "Rune",
        ["Valiance"] = "Ward",
        ["Vallation"] = "Ward",
        ["Violent Flourish"] = "Flourish1",
        ["Warlock's Roll"] = "CorsairRoll",
        ["Water Shot"] = "CorsairShot",
        ["Wild Flourish"] = "Flourish2",
        ["Wind Shot"] = "CorsairShot",
        ["Wizard's Roll"] = "CorsairRoll",
    };

    // Given a category branch's base guard and its resolved leaves, broaden the guard to also match any
    // sub-typed abilities present among the named leaves. e.g. a JobAbility arm holding "Curing Waltz"
    // becomes `(spell.type == 'JobAbility' or spell.type == 'Waltz')`. Extra types are appended in
    // ordinal order after the base guard for deterministic output. Non-sub-typed leaves (Berserk) and
    // non-JobAbility branches (WeaponSkill/Magic) leave the guard untouched.
    private static string BroadenGuardForSubTypes(string baseCond, IEnumerable<BlueprintNodeDto> leaves)
    {
        var extras = leaves
            .Select(l => l.Data.ActionName)
            .Where(n => !string.IsNullOrEmpty(n) && AbilitySubTypes.ContainsKey(n!))
            .Select(n => AbilitySubTypes[n!])
            .Distinct()
            .OrderBy(t => t, System.StringComparer.Ordinal)
            .ToList();
        if (extras.Count == 0) return baseCond;

        var ors = string.Join("", extras.Select(t => $" or spell.type == '{t}'"));
        return $"({baseCond}{ors})";
    }
}
