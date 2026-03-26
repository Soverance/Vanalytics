namespace Vanalytics.Core.Data;

/// <summary>
/// Static catalog of FFXI Ultimate weapons (Relic, Mythic, Empyrean, Aeonic, Ergon).
/// Each entry defines the base weapon name (used to match all upgrade stages in GameItems),
/// the weapon category and the weapon skill it unlocks.
/// </summary>
public static class UltimateWeapons
{
    public record WeaponDef(string BaseName, string Category, string WeaponSkill);

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
        new("Claustrum",        "Relic", "Gate of Tartarus"),
        new("Annihilator",      "Relic", "Coronach"),
        new("Yoichinoyumi",     "Relic", "Namas Arrow"),
        new("Gjallarhorn",      "Relic", "Soul Voice"),
        new("Aegis",            "Relic", "—"),

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
        new("Idris",            "Mythic", "Exudation"),
        new("Epeolatry",        "Mythic", "Dimidiation"),

        // ── Empyrean Weapons (Abyssea) ───────────────────────────────────
        new("Ukonvasara",       "Empyrean", "Ukko's Fury"),
        new("Verethragna",      "Empyrean", "Victory Smite"),
        new("Gambanteinn",      "Empyrean", "Dagan"),
        new("Hvergelmir",       "Empyrean", "Myrkr"),
        new("Almace",           "Empyrean", "Chant du Cygne"),
        new("Caladbolg",        "Empyrean", "Torcleaver"),
        new("Farsha",           "Empyrean", "Cloudsplitter"),
        new("Twashtar",         "Empyrean", "Rudra's Storm"),
        new("Kannagi",          "Empyrean", "Blade: Hi"),
        new("Rhongomiant",      "Empyrean", "Camlann's Torment"),
        new("Redemption",       "Empyrean", "Quietus"),
        new("Masamune",         "Empyrean", "Tachi: Fudo"),
        new("Armageddon",       "Empyrean", "Wildfire"),
        new("Gandiva",          "Empyrean", "Jishnu's Radiance"),
        new("Daurdabla",        "Empyrean", "Tenuto"),
        new("Sequence",         "Empyrean", "Requiescat"),

        // ── Aeonic Weapons (Escha / Domain Invasion) ─────────────────────
        new("Chango",           "Aeonic", "Upheaval"),
        new("Godhands",         "Aeonic", "Howling Fist"),
        new("Aeneas",           "Aeonic", "Exenterator"),
        new("Lionheart",        "Aeonic", "Resolution"),
        new("Tri-edge",         "Aeonic", "Ruinator"),
        new("Dolichenus",       "Aeonic", "Mordant Rime"),
        new("Trishula",         "Aeonic", "Stardiver"),
        new("Heishi Shorinken", "Aeonic", "Blade: Shun"),
        new("Dojikiri Yasutsuna","Aeonic", "Tachi: Shoha"),
        new("Tishtrya",         "Aeonic", "Apex Arrow"),
        new("Khatvanga",        "Aeonic", "Shattersoul"),
        new("Fail-Not",         "Aeonic", "Empyreal Arrow"),
        new("Fomalhaut",        "Aeonic", "Last Stand"),
        new("Srivatsa",         "Aeonic", "Retribution"),

        // ── Ergon Weapons (Ambuscade) ────────────────────────────────────
        new("Anguta",           "Ergon", "Entropy"),
    ];
}
