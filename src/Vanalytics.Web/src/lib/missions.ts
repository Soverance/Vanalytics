// Mission catalogs for the 14 FFXI mission lines tracked by Vanalytics.
//
// Two flavors:
//   Bitfield lines (sandoria/bastok/windurst/zilart/ahturhgan/wotg/assaults):
//     server packet 0x056 Types 0x00D0/0x00D8/0x00C0 carry an 8-byte bitfield
//     per line. The catalog's `id` field IS the bit position in that bitfield.
//   Pointer lines (cop/acp/mkd/asa/soa/rov/tvr):
//     server packet 0x056 Types 0xFFFE/0xFFFF carry a single uint32 = the
//     player's current mission "internal id" (NOT the array index). The
//     catalog's `id` field matches that internal id; we display the entry
//     with the highest id <= current. Names beginning with "__" indicate
//     sub-missions within a chapter — kept as-is for visual hierarchy.
//
// Source: github.com/HiPotionQ8/XIchecklist maps/story.lua, used with
// author's permission. See [[reference_xichecklist_permission]].

export interface MissionEntry {
    id: number
    name: string
}

export type BitfieldLineKey =
    | 'sandoriaMissions'
    | 'bastokMissions'
    | 'windurstMissions'
    | 'zilartMissions'
    | 'ahturhganMissions'
    | 'wotgMissions'
    | 'assaults'

export type PointerLineKey =
    | 'copMissions'
    | 'acpMissions'
    | 'mkdMissions'
    | 'asaMissions'
    | 'soaMissions'
    | 'rovMissions'
    | 'tvrMissions'

export type MissionLineKey = BitfieldLineKey | PointerLineKey

export const MISSION_LINE_LABELS: Record<MissionLineKey, string> = {
    sandoriaMissions: "San d'Oria Missions",
    bastokMissions: 'Bastok Missions',
    windurstMissions: 'Windurst Missions',
    zilartMissions: 'Rise of the Zilart',
    ahturhganMissions: 'Treasures of Aht Urhgan',
    wotgMissions: 'Wings of the Goddess',
    assaults: 'Assaults',
    copMissions: 'Chains of Promathia',
    acpMissions: 'A Crystalline Prophecy',
    mkdMissions: "A Moogle Kupo d'Etat",
    asaMissions: 'A Shantotto Ascension',
    soaMissions: 'Seekers of Adoulin',
    rovMissions: "Rhapsodies of Vana'diel",
    tvrMissions: 'The Voracious Resurgence',
}

export const BITFIELD_LINES: BitfieldLineKey[] = [
    'sandoriaMissions', 'bastokMissions', 'windurstMissions',
    'zilartMissions', 'ahturhganMissions', 'wotgMissions', 'assaults',
]

export const POINTER_LINES: PointerLineKey[] = [
    'copMissions', 'acpMissions', 'mkdMissions', 'asaMissions',
    'soaMissions', 'rovMissions', 'tvrMissions',
]

const SANDORIA: MissionEntry[] = [
    { id: 0, name: 'Smash the Orcish Scouts' },
    { id: 1, name: 'Bat Hunt' },
    { id: 2, name: 'Save the Children' },
    { id: 3, name: 'The Rescue Drill' },
    { id: 4, name: 'The Davoi Report' },
    { id: 5, name: 'Journey Abroad' },
    { id: 10, name: 'Infiltrate Davoi' },
    { id: 11, name: 'The Crystal Spring' },
    { id: 12, name: 'Appointment to Jeuno' },
    { id: 13, name: 'Magicite' },
    { id: 14, name: "The Ruins of Fei'Yin" },
    { id: 15, name: 'The Shadow Lord' },
    { id: 16, name: "Leaute's Last Wishes" },
    { id: 17, name: "Ranperre's Final Rest" },
    { id: 18, name: "Prestige of the Papsque" },
    { id: 19, name: 'The Secret Weapon' },
    { id: 20, name: 'Coming of Age' },
    { id: 21, name: 'Lightbringer' },
    { id: 22, name: 'Breaking Barriers' },
    { id: 23, name: 'The Heir to the Light' },
]

const BASTOK: MissionEntry[] = [
    { id: 0, name: 'The Zeruhn Report' },
    { id: 1, name: 'A Geological Survey' },
    { id: 2, name: 'Fetichism' },
    { id: 3, name: 'The Crystal Line' },
    { id: 4, name: 'Wading Beasts' },
    { id: 5, name: 'The Emissary' },
    { id: 10, name: 'The Four Musketeers' },
    { id: 11, name: 'To the Forsaken Mines' },
    { id: 12, name: 'Jeuno' },
    { id: 13, name: 'Magicite' },
    { id: 14, name: 'Darkness Rising' },
    { id: 15, name: 'Xarcabard, Land of Truths' },
    { id: 16, name: 'Return of the Talekeeper' },
    { id: 17, name: "The Pirates' Cove" },
    { id: 18, name: 'The Final Image' },
    { id: 19, name: 'On My Way' },
    { id: 20, name: 'The Chains That Bind Us' },
    { id: 21, name: 'Enter the Talekeeper' },
    { id: 22, name: 'The Salt of the Earth' },
    { id: 23, name: 'Where Two Paths Converge' },
]

const WINDURST: MissionEntry[] = [
    { id: 0, name: 'The Horutoto Ruins Experiment' },
    { id: 1, name: 'The Heart of the Matter' },
    { id: 2, name: 'The Price of Peace' },
    { id: 3, name: 'Lost for Words' },
    { id: 4, name: 'A Testing Time' },
    { id: 5, name: 'The Three Kingdoms' },
    { id: 10, name: 'To Each His Own Right' },
    { id: 11, name: 'Written in the Stars' },
    { id: 12, name: 'A New Journey' },
    { id: 13, name: 'Magicite' },
    { id: 14, name: 'The Final Seal' },
    { id: 15, name: 'The Shadow Awaits' },
    { id: 16, name: 'Full Moon Fountain' },
    { id: 17, name: 'Saintly Invitation' },
    { id: 18, name: 'The Sixth Ministry' },
    { id: 19, name: 'Awakening of the Gods' },
    { id: 20, name: 'Vain' },
    { id: 21, name: "The Jester Who'd Be King" },
    { id: 22, name: 'Doll of the Dead' },
    { id: 23, name: 'Moon Reading' },
]

const ZILART: MissionEntry[] = [
    { id: 0, name: 'The New Frontier' },
    { id: 4, name: "Welcome t'Norg" },
    { id: 6, name: "Kazham's Chieftainess" },
    { id: 8, name: 'The Temple of Uggalepih' },
    { id: 10, name: 'Headstone Pilgrimage' },
    { id: 12, name: 'Through the Quicksand Caves' },
    { id: 14, name: 'The Chamber of Oracles' },
    { id: 16, name: "Return to Delkfutt's Tower" },
    { id: 18, name: "Ro'Maeve" },
    { id: 20, name: 'The Temple of Desolation' },
    { id: 22, name: 'The Hall of the Gods' },
    { id: 23, name: 'The Mithra and the Crystal' },
    { id: 24, name: 'The Gate of the Gods' },
    { id: 26, name: 'Ark Angels' },
    { id: 27, name: 'The Sealed Shrine' },
    { id: 28, name: 'The Celestial Nexus' },
    { id: 30, name: 'Awakening' },
]

const AHTURHGAN: MissionEntry[] = [
    { id: 0, name: 'Land of Sacred Serpents' },
    { id: 1, name: 'Immortal Sentries' },
    { id: 2, name: 'President Salaheem' },
    { id: 3, name: 'Knight of Gold' },
    { id: 4, name: 'Confessions of Royalty' },
    { id: 5, name: 'Easterly Winds' },
    { id: 6, name: 'Westerly Winds' },
    { id: 7, name: 'A Mercenary Life' },
    { id: 8, name: 'Undersea Scouting' },
    { id: 9, name: 'Astral Waves' },
    { id: 10, name: 'Imperial Schemes' },
    { id: 11, name: 'Royal Puppeteer' },
    { id: 12, name: 'Lost Kingdom' },
    { id: 13, name: 'The Dolphin Crest' },
    { id: 14, name: 'The Black Coffin' },
    { id: 15, name: 'Ghosts of the Past' },
    { id: 16, name: 'Guests of the Empire' },
    { id: 17, name: 'Passing Glory' },
    { id: 18, name: 'Sweets for the Soul' },
    { id: 19, name: 'Teahouse Tumult' },
    { id: 20, name: 'Finders Keepers' },
    { id: 21, name: 'Shield of Diplomacy' },
    { id: 22, name: 'Social Graces' },
    { id: 23, name: 'Foiled Ambition' },
    { id: 24, name: 'Playing the Part' },
    { id: 25, name: 'Seal of the Serpent' },
    { id: 26, name: 'Misplaced Nobility' },
    { id: 27, name: 'Bastion of Knowledge' },
    { id: 28, name: 'Puppet in Peril' },
    { id: 29, name: 'Prevalence of Pirates' },
    { id: 30, name: 'Shades of Vengeance' },
    { id: 31, name: 'In the Blood' },
    { id: 32, name: "Sentinels' Honor" },
    { id: 33, name: 'Testing the Waters' },
    { id: 34, name: 'Legacy of the Lost' },
    { id: 35, name: 'Gaze of the Saboteur' },
    { id: 36, name: 'Path of Blood' },
    { id: 37, name: 'Stirrings of War' },
    { id: 38, name: 'Allied Rumblings' },
    { id: 39, name: 'Unraveling Reason' },
    { id: 40, name: 'Light of Judgment' },
    { id: 41, name: 'Path of Darkness' },
    { id: 42, name: 'Fangs of the Lion' },
    { id: 43, name: "Nashmeira's Plea" },
    { id: 44, name: 'Ragnarok' },
    { id: 45, name: 'Imperial Coronation' },
    { id: 46, name: 'The Empress Crowned' },
]

const WOTG: MissionEntry[] = [
    { id: 0, name: 'Cavernous Maws' },
    { id: 1, name: 'Back to the Beginning' },
    { id: 2, name: 'Cait Sith' },
    { id: 3, name: 'The Queen of the Dance' },
    { id: 4, name: 'While the Cat Is Away' },
    { id: 5, name: 'A Timeswept Butterfly' },
    { id: 6, name: 'Purple, The New Black' },
    { id: 7, name: 'In the Name of the Father' },
    { id: 8, name: 'Dancers in Distress' },
    { id: 9, name: 'Daughter of a Knight' },
    { id: 10, name: 'A Spoonful of Sugar' },
    { id: 11, name: 'Affairs of State' },
    { id: 12, name: 'Borne by the Wind' },
    { id: 13, name: 'A Nation on the Brink' },
    { id: 14, name: 'Crossroads of Time' },
    { id: 15, name: 'Sandswept Memories' },
    { id: 16, name: 'Northland Exposure' },
    { id: 17, name: 'Traitor in the Midst' },
    { id: 18, name: 'Betrayal at Beaucedine' },
    { id: 19, name: 'On Thin Ice' },
    { id: 20, name: 'Proof of Valor' },
    { id: 21, name: 'A Sanguinary Prelude' },
    { id: 22, name: 'Dungeons and Dancers' },
    { id: 23, name: 'Distorter of Time' },
    { id: 24, name: 'The Will of the World' },
    { id: 25, name: 'Fate in Haze' },
    { id: 26, name: 'The Scent of Battle' },
    { id: 27, name: 'Another World' },
    { id: 28, name: 'A Hawk in Repose' },
    { id: 29, name: 'The Battle of Xarcabard' },
    { id: 30, name: 'Prelude to a Storm' },
    { id: 31, name: "Storm's Crescendo" },
    { id: 32, name: "Into the Beast's Maw" },
    { id: 33, name: 'The Hunter Ensnared' },
    { id: 34, name: 'Flight of the Lion' },
    { id: 35, name: 'Fall of the Hawk' },
    { id: 36, name: 'Darkness Descends' },
    { id: 37, name: 'Adieu, Lilisette' },
    { id: 38, name: 'By the Fading Light' },
    { id: 39, name: 'Edge of Existence' },
    { id: 40, name: 'Her Memories' },
    { id: 41, name: 'Forget Me Not' },
    { id: 42, name: 'Pillar of Hope' },
    { id: 43, name: 'Glimmer of Life' },
    { id: 44, name: 'Time Slips Away' },
    { id: 45, name: 'When Wills Collide' },
    { id: 46, name: 'Whispers of Dawn' },
    { id: 47, name: 'A Dreamy Interlude' },
    { id: 48, name: 'Cait in the Woods' },
    { id: 49, name: 'Fork in the Road' },
    { id: 50, name: 'Maiden of the Dusk' },
    { id: 51, name: 'Where It All Began' },
    { id: 52, name: 'A Token of Troth' },
]

const ASSAULTS: MissionEntry[] = [
    { id: 1, name: 'Leujaoam Cleansing' }, { id: 2, name: 'Orichalcum Survey' },
    { id: 3, name: 'Escort Professor Chanoix' }, { id: 4, name: 'Shanarha Grass Conservation' },
    { id: 5, name: 'Counting Sheep' }, { id: 6, name: 'Supplies Recovery' },
    { id: 7, name: 'Azure Experiments' }, { id: 8, name: 'Imperial Code' },
    { id: 9, name: 'Red Versus Blue' }, { id: 10, name: 'Bloody Rondo' },
    { id: 11, name: 'Imperial Agent Rescue' }, { id: 12, name: 'Preemptive Strike' },
    { id: 13, name: 'Sagelord Elimination' }, { id: 14, name: 'Breaking Morale' },
    { id: 15, name: 'The Double Agent' }, { id: 16, name: 'Imperial Treasure Retrieval' },
    { id: 17, name: 'Blitzkrieg' }, { id: 18, name: 'Marids in the Mist' },
    { id: 19, name: 'Azure Ailments' }, { id: 20, name: 'The Susanoo Shuffle' },
    { id: 21, name: 'Excavation Duty' }, { id: 22, name: 'Lebros Supplies' },
    { id: 23, name: 'Troll Fugitives' }, { id: 24, name: 'Evade and Escape' },
    { id: 25, name: 'Siegemaster Assassination' }, { id: 26, name: 'Apkallu Breeding' },
    { id: 27, name: 'Wamoura Farm Raid' }, { id: 28, name: 'Egg Conservation' },
    { id: 29, name: 'Operation: Black Pearl' }, { id: 30, name: 'Better Than One' },
    { id: 31, name: 'Seagull Grounded' }, { id: 32, name: 'Requiem' },
    { id: 33, name: 'Saving Private Ryaaf' }, { id: 34, name: 'Shooting Down the Baron' },
    { id: 35, name: 'Building Bridges' }, { id: 36, name: 'Stop the Bloodshed' },
    { id: 37, name: 'Defuse the Threat' }, { id: 38, name: 'Operation: Snake Eyes' },
    { id: 39, name: 'Wake the Puppet' }, { id: 40, name: 'The Price Is Right' },
    { id: 41, name: 'Golden Salvage' }, { id: 42, name: 'Lamia No. 13' },
    { id: 43, name: 'Extermination' }, { id: 44, name: 'Demolition Duty' },
    { id: 45, name: 'Searat Salvation' }, { id: 46, name: 'Apkallu Seizure' },
    { id: 47, name: 'Lost and Found' }, { id: 48, name: 'Deserter' },
    { id: 49, name: 'Desperately Seeking Cephalopods' }, { id: 50, name: "Bellerophon's Bliss" },
    { id: 51, name: 'Nyzul Isle Investigation' }, { id: 52, name: 'Nyzul Isle Uncharted Area Survey' },
]

const COP: MissionEntry[] = [
    { id: 101, name: 'Ancient Flames Beckon' }, { id: 110, name: '__The Rites of Life' },
    { id: 118, name: '__Below the Arks' }, { id: 128, name: '__The Mothercrystals' },
    { id: 137, name: 'The Isle of Forgotten Saints' }, { id: 138, name: '__An Invitation West' },
    { id: 218, name: '__The Lost City' }, { id: 228, name: '__Distant Beliefs' },
    { id: 238, name: '__An Eternal Melody' }, { id: 248, name: '__Ancient Vows' },
    { id: 257, name: 'A Transient Dream' }, { id: 258, name: '__The Call of the Wyrmking' },
    { id: 318, name: '__A Vessel Without a Captain' }, { id: 325, name: '__The Road Forks' },
    { id: 330, name: '____Emerald Waters' }, { id: 331, name: '______Vicissitudes' },
    { id: 335, name: '______Descendants of a Line Lost' }, { id: 339, name: '______Louverance' },
    { id: 340, name: '____Memories of a Maiden' }, { id: 341, name: '______Comedy of Errors, Act I' },
    { id: 345, name: '______Comedy of Errors, Act II' }, { id: 349, name: '______Exit Stage Left' },
    { id: 350, name: '__Tending Aged Wounds' }, { id: 358, name: '__Darkness Named' },
    { id: 367, name: 'The Cradles of Children Lost' }, { id: 368, name: '__Sheltering Doubt' },
    { id: 418, name: '__The Savage' }, { id: 428, name: '__The Secrets of Worship' },
    { id: 438, name: '__Slanderous Utterings' }, { id: 447, name: 'The Return Home' },
    { id: 448, name: '__The Enduring Tumult of War' }, { id: 518, name: '__Desires of Emptiness' },
    { id: 530, name: '__Three Paths' }, { id: 540, name: '____Past Sins' },
    { id: 542, name: '______Southern Legend' }, { id: 543, name: '______Partners Without Fame' },
    { id: 546, name: '______A Century of Hardship' }, { id: 549, name: '______Departures' },
    { id: 550, name: '____The Pursuit of Paradise' }, { id: 552, name: '______Spiral' },
    { id: 553, name: '______Branded' }, { id: 556, name: '______Pride and Honor' },
    { id: 559, name: '______And the Compass Guides' }, { id: 560, name: '____Where Messengers Gather' },
    { id: 562, name: '______Entanglement' }, { id: 564, name: '______Head Wind' },
    { id: 568, name: '______Flames for the Dead' }, { id: 577, name: 'Echoes of Time' },
    { id: 578, name: '__For Whom the Verse Is Sung' }, { id: 618, name: '__A Place to Return' },
    { id: 628, name: '__More Questions Than Answers' }, { id: 638, name: '__One to Be Feared' },
    { id: 647, name: 'In the Light of the Crystal' }, { id: 648, name: '__Chains and Bonds' },
    { id: 718, name: '__Flames in the Darkness' }, { id: 728, name: '__Fire in the Eyes of Men' },
    { id: 738, name: '__Calm Before the Storm' }, { id: 748, name: "__The Warrior's Path" },
    { id: 758, name: 'Emptiness Bleeds' }, { id: 800, name: '__Garden of Antiquity' },
    { id: 818, name: '__A Fate Decided' }, { id: 828, name: '__When Angels Fall' },
    { id: 840, name: '__Dawn' },
]

const ACP: MissionEntry[] = [
    { id: 0, name: 'A Crystalline Prophecy' },
    { id: 1, name: 'The Echo Awakens' },
    { id: 2, name: 'Gatherer of Light (I)' },
    { id: 3, name: 'Gatherer of Light (II)' },
    { id: 4, name: 'Those Who Lurk in Shadows (I)' },
    { id: 5, name: 'Those Who Lurk in Shadows (II)' },
    { id: 6, name: 'Those Who Lurk in Shadows (III)' },
    { id: 7, name: 'Remember Me in Your Dreams' },
    { id: 8, name: 'Born of Her Nightmares' },
    { id: 9, name: 'Banishing the Echo' },
    { id: 10, name: 'Ode of Life Bestowing' },
]

const MKD: MissionEntry[] = [
    { id: 0, name: "A Moogle Kupo d'Etat" },
    { id: 1, name: 'Drenched! It Began with a Raindrop' },
    { id: 2, name: 'Hasten! In a Jam in Jeuno?' },
    { id: 3, name: 'Welcome! To My Decrepit Domicile' },
    { id: 4, name: 'Curses! A Horrifically Harrowing Hex' },
    { id: 5, name: "An Errand! The Professor's Price" },
    { id: 6, name: 'Shock! Arrant Abuse of Authority' },
    { id: 7, name: 'Lender Beware! Read the Fine Print' },
    { id: 8, name: "Rescue! A Moogle's Labor of Love" },
    { id: 9, name: 'Roar! A Cat Burglar Bares Her Fangs' },
    { id: 10, name: 'Relief! A Triumphant Return' },
    { id: 11, name: 'Joy! Summoned to a Fabulous Fete' },
    { id: 12, name: 'A Challenge! You Could Be a Winner' },
    { id: 13, name: 'Smash! A Malevolent Menace' },
]

const ASA: MissionEntry[] = [
    { id: 0, name: 'A Shantotto Ascension' },
    { id: 1, name: 'Burgeoning Dread' },
    { id: 2, name: 'That Which Curdles Blood' },
    { id: 3, name: 'Sugar-coated Directive' },
    { id: 4, name: 'Enemy of the Empire (I)' },
    { id: 5, name: 'Enemy of the Empire (II)' },
    { id: 6, name: 'Sugar-coated Subterfuge' },
    { id: 7, name: 'Shantotto in Chains' },
    { id: 8, name: 'Fountain of Trouble' },
    { id: 9, name: 'Battaru Royale' },
    { id: 10, name: 'Romancing the Clone' },
    { id: 11, name: 'Sisters in Arms' },
    { id: 12, name: 'Project: Shantottofication' },
    { id: 13, name: 'An Uneasy Peace' },
]

// SoA has duplicate ids (chapter titles share their first sub-mission's id).
// Display logic picks the entry whose id <= current with the highest id; if
// ties, the last entry wins (sub-mission name preferred over chapter name).
const SOA: MissionEntry[] = [
    { id: 110, name: 'The Sacred City of Adoulin' },
    { id: 110, name: '__Rumors from the West' }, { id: 112, name: '__The Geomagnetron' },
    { id: 116, name: '__Onward to Adoulin' }, { id: 120, name: '__Heartwings and the Kindhearted' },
    { id: 122, name: '__Pioneer Registration' }, { id: 124, name: '__Life on the Frontier' },
    { id: 126, name: '__Meeting of the Minds' }, { id: 128, name: '__Arciela Appears Again' },
    { id: 132, name: 'The Ancient Pact' }, { id: 132, name: '__Budding Prospects' },
    { id: 134, name: '____The Light Shining in Your Eyes' }, { id: 136, name: '____The Heirloom' },
    { id: 138, name: '__An Aimless Journey' }, { id: 140, name: '____Ortharsyne' },
    { id: 142, name: '____In the Presence of Royalty' }, { id: 144, name: '__The Twin World Trees' },
    { id: 146, name: '__Honor and Audacity' }, { id: 148, name: '____The Watergarden Coliseum' },
    { id: 150, name: '__Friction and Fissures' }, { id: 152, name: '____The Celennia Memorial Library' },
    { id: 156, name: '____For Whom Do We Toil?' }, { id: 162, name: '__Aiming for Ygnas' },
    { id: 164, name: '____Calamity in the Kitchen' }, { id: 168, name: "____Arciela's Promise" },
    { id: 170, name: '__Predators and Prey' }, { id: 172, name: '____Behind the Sluices' },
    { id: 178, name: '____The Leafkin Monarch' }, { id: 180, name: '____Yggdrasil' },
    { id: 184, name: 'Shadows Upon Adoulin' }, { id: 184, name: '__Return of the Exorcist' },
    { id: 186, name: '____The Merciless One' }, { id: 188, name: '____A Curse from the Past' },
    { id: 190, name: '____The Purgation' }, { id: 192, name: '____The Key' },
    { id: 194, name: "__The Princess's Dilemma" }, { id: 196, name: '____Dark Clouds Ahead' },
    { id: 198, name: '____The Smallest of Favors' }, { id: 200, name: '__Summoned by Spirits' },
    { id: 202, name: '____Evil Entities' }, { id: 204, name: '____Adoulin Calling' },
    { id: 206, name: '____The Disappearance of Nyline' }, { id: 208, name: '____Shared Consciousness' },
    { id: 210, name: '____Clear Skies' }, { id: 212, name: '__The Man in Black' },
    { id: 214, name: '____To the Victor...' }, { id: 216, name: '____An Extraordinary Gentleman' },
    { id: 220, name: "____The Order's Treasures" }, { id: 222, name: "____August's Heirloom" },
    { id: 224, name: '__Beauty and the Beast' }, { id: 226, name: '____Wildcat with a Gold Pelt' },
    { id: 228, name: '____In Search of Arciela' }, { id: 232, name: '____Looking For Leads' },
    { id: 234, name: '__Drifting Northwest' }, { id: 236, name: '____Kumhau, the Flashfrost Naakual' },
    { id: 242, name: '____Soul Siphon' }, { id: 244, name: '____Stonewalled' },
    { id: 248, name: '____Salvation' }, { id: 250, name: '____Glimmer of Portent' },
    { id: 252, name: 'The Serpentine Labyrinth' }, { id: 252, name: '__...Into the Fire' },
    { id: 254, name: '____Melvien de Malecroix' }, { id: 256, name: '____Courier Catastrophe' },
    { id: 258, name: '____Done and Delivered' }, { id: 260, name: '____Ministerial Whispers' },
    { id: 262, name: '____A Day in the Life of a Pioneer' }, { id: 264, name: '__Lighting the Way' },
    { id: 266, name: "____Sajj'aka" }, { id: 268, name: '____Studying Up' },
    { id: 270, name: '____A Vow of Truth' }, { id: 272, name: '____Darrcuiln' },
    { id: 274, name: '__The Gates' }, { id: 278, name: '____Morimar' },
    { id: 280, name: '____A New Force Arises' }, { id: 282, name: '____The Sacred Sapling' },
    { id: 284, name: '____Tree Grafting' }, { id: 286, name: '____A Shrouded Canopy' },
    { id: 288, name: '____Leafallia' }, { id: 290, name: "____Rosulatia's Promise" },
    { id: 292, name: '____The Lightsland' }, { id: 294, name: '____The Light of Dawn Comes...' },
    { id: 296, name: '__Cries from the Deep' }, { id: 298, name: '____Seeds of Doubt' },
    { id: 300, name: '____The Tomatoes of Wrath' }, { id: 302, name: '____A Grave Mistake' },
    { id: 306, name: '____An Emergency Convocation' }, { id: 308, name: '__Balamor, the Deathborne Xol' },
    { id: 310, name: '____Anagnorisis' }, { id: 312, name: '____Just the Thing' },
    { id: 314, name: '____Sugarcoated Salvation' }, { id: 316, name: "____Arciela's Resolve" },
    { id: 318, name: "__Balamor's Ruse" }, { id: 320, name: '____The Charlatan' },
    { id: 324, name: '____Royal Blessings' }, { id: 326, name: 'Hades' },
    { id: 326, name: '__Arboreal Rumors' }, { id: 328, name: "____Arciela's Missive" },
    { id: 330, name: '____Heroes, Unite!' }, { id: 332, name: '____A Portent Most Ominous' },
    { id: 334, name: '__Yggdrasil Beckons' }, { id: 336, name: '____Returning to the Trees' },
    { id: 338, name: '____The Key to the Turris' }, { id: 342, name: "__Teodor's Summons" },
    { id: 344, name: '____The Seventh Guardian' }, { id: 346, name: '____Watery Grave' },
    { id: 350, name: '____Blood for Blood' }, { id: 352, name: '__Reckoning' },
    { id: 356, name: '____Abomination' }, { id: 360, name: '__Undying Light' },
    { id: 368, name: '____The Light Within' },
]

const ROV: MissionEntry[] = [
    { id: 0, name: "Rhapsodies of Vana'diel" },
    { id: 110, name: 'Chapter One: Creation and Rebirth' }, { id: 110, name: '__Resonance' },
    { id: 111, name: '__Emissary from the Seas' }, { id: 112, name: '__Set Free' },
    { id: 114, name: '__The Beginning' }, { id: 118, name: '__Flames of Prayer' },
    { id: 120, name: '__The Path Untraveled' }, { id: 126, name: "__At the Heavens' Door" },
    { id: 128, name: "__The Lion's Roar" }, { id: 130, name: '__Eddies of Despair' },
    { id: 134, name: '__A Land After Time' }, { id: 136, name: "__Fate's Call" },
    { id: 138, name: '__What Lies Beyond' }, { id: 140, name: '__The Ties That Bind' },
    { id: 142, name: '__Impurity' }, { id: 144, name: '__The Lost Avatar' },
    { id: 148, name: '__Volto Oscuro' }, { id: 150, name: '__Ring My Bell' },
    { id: 152, name: 'Chapter Two: Revitalization' }, { id: 152, name: '__Spirits Awoken' },
    { id: 154, name: '__Crashing Waves' }, { id: 156, name: '__Call to Serve' },
    { id: 158, name: '__Numbering Days' }, { id: 160, name: '__Inescapable Binds' },
    { id: 162, name: '__Desert Winds' }, { id: 164, name: '__Ever Forward' },
    { id: 168, name: '__The Endless Sky' }, { id: 170, name: "__Aphmau's Light" },
    { id: 172, name: '__Reunited' }, { id: 174, name: '__Take Wing' },
    { id: 176, name: '__Prime Number' }, { id: 178, name: '__From the Ruins' },
    { id: 180, name: '__Cauterize' }, { id: 186, name: '__Uncertain Destinations' },
    { id: 188, name: '__Ganged Up On' }, { id: 191, name: '__Sacrifice' },
    { id: 194, name: '__Somber Dreams' }, { id: 200, name: '__Of Light and Darkness' },
    { id: 202, name: '__Temporary Farewells' }, { id: 204, name: '__Brushing Up' },
    { id: 206, name: '__Keep On Giving' }, { id: 208, name: '__Past Imperfect' },
    { id: 209, name: '__The Cursed Temple' }, { id: 211, name: '__Wisdom of Our Forefathers' },
    { id: 212, name: '__Where Divinities Collide' }, { id: 214, name: '__Visions of Dread' },
    { id: 216, name: '__To the Skies' }, { id: 218, name: "__Escha - Ru'Aun" },
    { id: 222, name: '__The Decisive Heroine' }, { id: 224, name: '__Fall from Grace' },
    { id: 226, name: '__Banishing the Darkness' }, { id: 228, name: '__Over the Rainbow' },
    { id: 230, name: '__Cacophonous Discord' }, { id: 232, name: '__Eddies of Despair' },
    { id: 234, name: '__Pretender to the Throne' }, { id: 238, name: '__Banished' },
    { id: 240, name: '__Call of the Void' }, { id: 244, name: '__Both Paths Taken' },
    { id: 250, name: '__The Man Behind the Mask' }, { id: 252, name: '__Uncertain Futures' },
    { id: 254, name: 'Chapter 3: Reckoning' }, { id: 254, name: '__Darkness Beckons' },
    { id: 258, name: '__The Brewing Storm' }, { id: 260, name: '__The River Runs Red' },
    { id: 262, name: '__The Crucible' }, { id: 263, name: '__Forward Thinking' },
    { id: 264, name: '__Tears of the Generals' }, { id: 266, name: '__What He Left Behind' },
    { id: 268, name: '__Gone but Not Forgotten' }, { id: 269, name: '__August Artifacts' },
    { id: 270, name: '__Solemnity' }, { id: 272, name: '__Eyes on You' },
    { id: 274, name: '__Exploring the Ruins' }, { id: 278, name: '__Become Something More' },
    { id: 280, name: '__Unshakable Nightmares' }, { id: 282, name: '__What Remains of Hope' },
    { id: 286, name: '__Death Cares Not' }, { id: 288, name: '__No Time like the Future' },
    { id: 292, name: '__Sin' }, { id: 296, name: '__Penance' },
    { id: 298, name: '__Vessel of Light' }, { id: 300, name: '__The Lifestream of Reisenjima' },
    { id: 302, name: '__From West to East' }, { id: 304, name: '__Good Things Come in Threes' },
    { id: 306, name: '__Tackling the Problem' }, { id: 308, name: '__Way to Divinity' },
    { id: 310, name: '__The Winds of Time' }, { id: 314, name: '__Calm After the Storm' },
    { id: 318, name: '__Nary a Cloud in Sight' }, { id: 320, name: '__An Unending Song' },
    { id: 324, name: '__A Deep Sleep' }, { id: 326, name: '__Guardians' },
    { id: 328, name: '__Iroha in Distress' }, { id: 330, name: '__Absolute Trust' },
    { id: 332, name: "__The Orb's Radiance" }, { id: 334, name: '__A Rhapsody for the Ages' },
]

const TVR: MissionEntry[] = [
    { id: 0, name: 'The Voracious Resurgence' },
    { id: 110, name: "__The Gloom Phantom's Approach" }, { id: 118, name: '__The Brygid Cup' },
    { id: 128, name: '__The Destiny Destroyers' }, { id: 138, name: "__Kupipi's Dilemma" },
    { id: 146, name: "__The Cardians' Duty" }, { id: 158, name: "__Zhuu Buxu's Gambit" },
    { id: 168, name: '__Star Onion Fortune' }, { id: 178, name: '__The Doll Whisperer' },
    { id: 192, name: '__Dancing Prince' }, { id: 202, name: "__Claidie's Concern" },
    { id: 210, name: '__Curilla Unleashed' }, { id: 228, name: '__Run, Excenmille, Run!' },
    { id: 240, name: '__Of Knights and Orcs' }, { id: 256, name: '__Best Served Cold' },
    { id: 270, name: "__Cornelia's Call to Action" }, { id: 286, name: '__Naja the Ambitious' },
    { id: 298, name: '__Raubahn the Blue' }, { id: 310, name: "__Ghatsad's Quandary" },
    { id: 326, name: '__The Revelation' }, { id: 338, name: "__Tateeya's Worries" },
    { id: 352, name: '__The Seagull Phratrie' }, { id: 362, name: '__The Sea Sage' },
    { id: 380, name: '__Sky, Moon, Incantrix' }, { id: 392, name: "__Nii's Last Stand" },
    { id: 414, name: '__Dance of the Tengu' }, { id: 430, name: "__Raebrimm's Rebirth" },
    { id: 440, name: '__Uran-Mafran of the Maelstrom' }, { id: 452, name: "__Koru-Moru's Hypothesis" },
    { id: 460, name: '__Altennia Burns Bright' }, { id: 468, name: '__Maat on the Rampage' },
    { id: 484, name: '__Not Just a Pretty Face' }, { id: 494, name: '__Delkfutt the Great' },
    { id: 508, name: '__Oshasha Violation' }, { id: 516, name: '__Phantasmic Heroes' },
    { id: 530, name: "__Skokkr Undrborn's Temptation" }, { id: 542, name: '__The Prime Weapons' },
    { id: 552, name: '__To Movalpolos!' }, { id: 562, name: '__Magh Bihu on the Prowl' },
    { id: 574, name: '__101 Dazbogs' }, { id: 580, name: '__Kipdrix the Faithful' },
    { id: 592, name: "__Duke Alloces's Decision" }, { id: 602, name: "__Odin's Eye" },
    { id: 612, name: '__Moglesse Oblige' }, { id: 624, name: '__The Voracious Beast' },
]

export const MISSION_CATALOGS: Record<MissionLineKey, MissionEntry[]> = {
    sandoriaMissions: SANDORIA,
    bastokMissions: BASTOK,
    windurstMissions: WINDURST,
    zilartMissions: ZILART,
    ahturhganMissions: AHTURHGAN,
    wotgMissions: WOTG,
    assaults: ASSAULTS,
    copMissions: COP,
    acpMissions: ACP,
    mkdMissions: MKD,
    asaMissions: ASA,
    soaMissions: SOA,
    rovMissions: ROV,
    tvrMissions: TVR,
}

// For pointer-style lines: find the catalog entry the player is currently on
// (or just past). Returns the entry with the highest id <= current. Ties
// resolve to the LAST matching entry — chapter titles share the id of their
// first sub-mission, and the sub-mission name is the more useful display.
export function lookupCurrentMission(line: PointerLineKey, current: number): MissionEntry | null {
    const catalog = MISSION_CATALOGS[line]
    let best: MissionEntry | null = null
    for (const entry of catalog) {
        if (entry.id <= current) best = entry
        else break  // catalog is ordered by id ascending
    }
    return best
}

// Index of `current` within the catalog (for progress bar). Returns the
// 1-based position of the last entry with id <= current, or 0 if no match.
export function currentMissionPosition(line: PointerLineKey, current: number): number {
    const catalog = MISSION_CATALOGS[line]
    let pos = 0
    for (let i = 0; i < catalog.length; i++) {
        if (catalog[i].id <= current) pos = i + 1
        else break
    }
    return pos
}
