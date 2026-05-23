namespace Vanalytics.Core.Data;

/// <summary>
/// Static catalog of FFXI Ultimate weapons (Relic, Mythic, Empyrean, Aeonic, Ergon).
/// Each entry defines the base weapon name (used to match all upgrade stages in GameItems),
/// the weapon category and the weapon skill it unlocks. WeaponSkill is null for shields
/// and instruments, which have no associated weapon skill.
/// </summary>
public static class UltimateWeapons
{
    public record WeaponDef(string BaseName, string Category, string? WeaponSkill);

    public static readonly WeaponDef[] All =
    [
        // ── Relic Weapons (Dynamis) ──────────────────────────────────────
        new("Spharai",          "Relic", "Final Heaven"),
        new("Mandau",           "Relic", "Mercy Stroke"),
        new("Excalibur",        "Relic", "Knights of Round"),
        new("Ragnarok",         "Relic", "Scourge"),
        new("Guttler",          "Relic", "Onslaught"),
        new("Bravura",          "Relic", "Metatron Torment"),
        new("Apocalypse",       "Relic", "Catastrophe"),
        new("Gungnir",          "Relic", "Geirskogul"),
        new("Kikoku",           "Relic", "Blade: Metsu"),
        new("Amanomurakumo",    "Relic", "Tachi: Kaiten"),
        new("Mjollnir",         "Relic", "Randgrith"),
        new("Claustrum",        "Relic", "Gates of Tartarus"),
        new("Annihilator",      "Relic", "Coronach"),
        new("Yoichinoyumi",     "Relic", "Namas Arrow"),
        new("Gjallarhorn",      "Relic", null),
        new("Aegis",            "Relic", null),

        // ── Mythic Weapons (Assault / Nyzul Isle) ────────────────────────
        new("Conqueror",        "Mythic", "King's Justice"),
        new("Glanzfaust",       "Mythic", "Ascetic's Fury"),
        new("Yagrush",          "Mythic", "Mystic Boon"),
        new("Laevateinn",       "Mythic", "Vidohunir"),
        new("Murgleis",         "Mythic", "Death Blossom"),
        new("Vajra",            "Mythic", "Mandalic Stab"),
        new("Burtgang",         "Mythic", "Atonement"),
        new("Liberator",        "Mythic", "Insurgency"),
        new("Aymur",            "Mythic", "Primal Rend"),
        new("Carnwenhan",       "Mythic", "Mordant Rime"),
        new("Gastraphetes",     "Mythic", "Trueflight"),
        new("Kogarasumaru",     "Mythic", "Tachi: Rana"),
        new("Nagi",             "Mythic", "Blade: Kamu"),
        new("Ryunohige",        "Mythic", "Drakesbane"),
        new("Nirvana",          "Mythic", "Garland of Bliss"),
        new("Tizona",           "Mythic", "Expiacion"),
        new("Death Penalty",    "Mythic", "Leaden Salute"),
        new("Kenkonken",        "Mythic", "Stringing Pummel"),
        new("Terpsichore",      "Mythic", "Pyrrhic Kleos"),
        new("Tupsimati",        "Mythic", "Omniscience"),

        // ── Empyrean Weapons (Abyssea) ───────────────────────────────────
        new("Verethragna",      "Empyrean", "Victory Smite"),
        new("Twashtar",         "Empyrean", "Rudra's Storm"),
        new("Almace",           "Empyrean", "Chant du Cygne"),
        new("Caladbolg",        "Empyrean", "Torcleaver"),
        new("Farsha",           "Empyrean", "Cloudsplitter"),
        new("Ukonvasara",       "Empyrean", "Ukko's Fury"),
        new("Redemption",       "Empyrean", "Quietus"),
        new("Rhongomiant",      "Empyrean", "Camlann's Torment"),
        new("Kannagi",          "Empyrean", "Blade: Hi"),
        new("Masamune",         "Empyrean", "Tachi: Fudo"),
        new("Gambanteinn",      "Empyrean", "Dagan"),
        new("Hvergelmir",       "Empyrean", "Myrkr"),
        new("Gandiva",          "Empyrean", "Jishnu's Radiance"),
        new("Armageddon",       "Empyrean", "Wildfire"),
        new("Ochain",           "Empyrean", null),
        new("Daurdabla",        "Empyrean", null),

        // ── Aeonic Weapons (Escha / Reisenjima) ──────────────────────────
        new("Godhands",         "Aeonic", "Shijin Spiral"),
        new("Aeneas",           "Aeonic", "Exenterator"),
        new("Sequence",         "Aeonic", "Requiescat"),
        new("Lionheart",        "Aeonic", "Resolution"),
        new("Tri-edge",         "Aeonic", "Ruinator"),
        new("Chango",           "Aeonic", "Upheaval"),
        new("Anguta",           "Aeonic", "Entropy"),
        new("Trishula",         "Aeonic", "Stardiver"),
        new("Heishi Shorinken", "Aeonic", "Blade: Shun"),
        new("Dojikiri Yasutsuna","Aeonic", "Tachi: Shoha"),
        new("Tishtrya",         "Aeonic", "Realmrazer"),
        new("Khatvanga",        "Aeonic", "Shattersoul"),
        new("Fail-Not",         "Aeonic", "Apex Arrow"),
        new("Fomalhaut",        "Aeonic", "Last Stand"),
        new("Srivatsa",         "Aeonic", null),
        new("Marsyas",          "Aeonic", null),

        // ── Ergon Weapons (Adoulin Mythic-tier for RUN / GEO) ────────────
        new("Idris",            "Ergon", "Exudation"),
        new("Epeolatry",        "Ergon", "Dimidiation"),
    ];
}
