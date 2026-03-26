namespace Vanalytics.Core.Data;

/// <summary>
/// Static catalog of FFXI Ultimate weapons (Relic, Mythic, Empyrean, Aeonic, Ergon).
/// Each entry defines the base weapon name (used to match all upgrade stages in GameItems),
/// the weapon category, associated job, and the weapon skill it unlocks.
/// </summary>
public static class UltimateWeapons
{
    public record WeaponDef(string BaseName, string Category, string Job, string WeaponSkill);

    public static readonly WeaponDef[] All =
    [
        // ── Relic Weapons (Dynamis) ──────────────────────────────────────
        new("Spharai",          "Relic", "MNK", "Final Heaven"),
        new("Mandau",           "Relic", "THF", "Mercy Stroke"),
        new("Excalibur",        "Relic", "PLD", "Knights of Round"),
        new("Ragnarok",         "Relic", "DRK", "Scourge"),
        new("Guttler",          "Relic", "BST", "Onslaught"),
        new("Bravura",          "Relic", "WAR", "Metatron Torment"),
        new("Apocalypse",       "Relic", "DRK", "Catastrophe"),
        new("Gungnir",          "Relic", "DRG", "Geirskogul"),
        new("Kikoku",           "Relic", "NIN", "Blade: Metsu"),
        new("Amanomurakumo",    "Relic", "SAM", "Tachi: Kaiten"),
        new("Mjollnir",         "Relic", "WHM", "Randgrith"),
        new("Claustrum",        "Relic", "BLM", "Gate of Tartarus"),
        new("Annihilator",      "Relic", "RNG", "Coronach"),
        new("Yoichinoyumi",     "Relic", "RNG", "Namas Arrow"),
        new("Gjallarhorn",      "Relic", "BRD", "Soul Voice"),
        new("Aegis",            "Relic", "PLD", "—"),

        // ── Mythic Weapons (Assault / Nyzul Isle) ────────────────────────
        new("Conqueror",        "Mythic", "WAR", "King's Justice"),
        new("Glanzfaust",       "Mythic", "MNK", "Ascetic's Fury"),
        new("Yagrush",          "Mythic", "WHM", "Mystic Boon"),
        new("Laevateinn",       "Mythic", "BLM", "Vidohunir"),
        new("Murgleis",         "Mythic", "RDM", "Death Blossom"),
        new("Vajra",            "Mythic", "THF", "Mandalic Stab"),
        new("Burtgang",         "Mythic", "PLD", "Atonement"),
        new("Liberator",        "Mythic", "DRK", "Insurgency"),
        new("Aymur",            "Mythic", "BST", "Primal Rend"),
        new("Carnwenhan",       "Mythic", "BRD", "Mordant Rime"),
        new("Gastraphetes",     "Mythic", "RNG", "Trueflight"),
        new("Kogarasumaru",     "Mythic", "SAM", "Tachi: Rana"),
        new("Nagi",             "Mythic", "NIN", "Blade: Kamu"),
        new("Ryunohige",        "Mythic", "DRG", "Drakesbane"),
        new("Nirvana",          "Mythic", "SMN", "Garland of Bliss"),
        new("Tizona",           "Mythic", "BLU", "Expiacion"),
        new("Death Penalty",    "Mythic", "COR", "Leaden Salute"),
        new("Kenkonken",        "Mythic", "PUP", "Stringing Pummel"),
        new("Terpsichore",      "Mythic", "DNC", "Pyrrhic Kleos"),
        new("Tupsimati",        "Mythic", "SCH", "Omniscience"),
        new("Idris",            "Mythic", "GEO", "Exudation"),
        new("Epeolatry",        "Mythic", "RUN", "Dimidiation"),

        // ── Empyrean Weapons (Abyssea) ───────────────────────────────────
        new("Ukonvasara",       "Empyrean", "WAR", "Ukko's Fury"),
        new("Verethragna",      "Empyrean", "MNK", "Victory Smite"),
        new("Gambanteinn",      "Empyrean", "WHM", "Dagan"),
        new("Hvergelmir",       "Empyrean", "BLM", "Myrkr"),
        new("Almace",           "Empyrean", "RDM", "Chant du Cygne"),
        new("Caladbolg",        "Empyrean", "DRK", "Torcleaver"),
        new("Farsha",           "Empyrean", "BST", "Cloudsplitter"),
        new("Twashtar",         "Empyrean", "DNC", "Rudra's Storm"),
        new("Kannagi",          "Empyrean", "NIN", "Blade: Hi"),
        new("Rhongomiant",      "Empyrean", "DRG", "Camlann's Torment"),
        new("Redemption",       "Empyrean", "DRK", "Quietus"),
        new("Masamune",         "Empyrean", "SAM", "Tachi: Fudo"),
        new("Gambanteinn",      "Empyrean", "WHM", "Dagan"),
        new("Armageddon",       "Empyrean", "RNG", "Wildfire"),
        new("Gandiva",          "Empyrean", "RNG", "Jishnu's Radiance"),
        new("Daurdabla",        "Empyrean", "BRD", "Tenuto"),
        new("Sequence",         "Empyrean", "PLD", "Requiescat"),

        // ── Aeonic Weapons (Escha / Domain Invasion) ─────────────────────
        new("Chango",           "Aeonic", "WAR", "Upheaval"),
        new("Godhands",         "Aeonic", "MNK", "Howling Fist"),
        new("Aeneas",           "Aeonic", "THF", "Exenterator"),
        new("Sequence",         "Aeonic", "PLD", "Requiescat"),
        new("Lionheart",        "Aeonic", "DRK", "Resolution"),
        new("Tri-edge",         "Aeonic", "BST", "Ruinator"),
        new("Dolichenus",       "Aeonic", "BRD", "Mordant Rime"),
        new("Trishula",         "Aeonic", "DRG", "Stardiver"),
        new("Heishi Shorinken", "Aeonic", "NIN", "Blade: Shun"),
        new("Dojikiri Yasutsuna","Aeonic","SAM", "Tachi: Shoha"),
        new("Tishtrya",         "Aeonic", "RNG", "Apex Arrow"),
        new("Khatvanga",        "Aeonic", "SMN", "Shattersoul"),
        new("Fail-Not",         "Aeonic", "RNG", "Empyreal Arrow"),
        new("Fomalhaut",        "Aeonic", "COR", "Last Stand"),
        new("Srivatsa",         "Aeonic", "GEO", "Retribution"),

        // ── Ergon Weapons (Ambuscade) ────────────────────────────────────
        new("Anguta",           "Ergon", "DRK", "Entropy"),
        new("Tri-edge",         "Ergon", "BST", "Ruinator"),
        new("Srivatsa",         "Ergon", "GEO", "Retribution"),
    ];
}
