// Mechanical classification for Blue Mage spells, consumed by the Blueprint editor's
// "BLU category" spell-condition field. Source of truth: BG-Wiki BLU spell pages
// (verified per spell). Keyed by spell id (stable across renames) — ids are the
// obtainable BlueMagic entries in spells.ts.
//
// `stat` is the single PRIMARY governing modifier; omit for classes with no stat basis
// (Breath / Healing / Buff / Stun / Skill). `unbridled` is ORTHOGONAL — an Unbridled
// spell still has its own class/stat; the flag marks the 18 spells castable only under the
// Unbridled Learning job ability (Unbridled Wisdom is NOT a separate roster — it is an SP
// ability granting sustained casting of the SAME 18 spells, so there is one "Unbridled"
// category, not two). A spell with no entry belongs to no bucket (safe default: it never
// mis-gears). Completeness is enforced by bluClassification.completeness.test.ts.

export type BluClass = 'Physical' | 'Magical' | 'Breath' | 'Healing' | 'Buff' | 'Stun' | 'Skill'
export type BluStat  = 'STR' | 'DEX' | 'VIT' | 'AGI' | 'INT' | 'MND' | 'CHR'

export interface BluClassification {
  class: BluClass
  stat?: BluStat
  /** True for the 18 spells requiring Unbridled Learning / Unbridled Wisdom to cast. */
  unbridled?: boolean
}

export const BLU_CLASSIFICATION: Record<number, BluClassification> = {
  513: { class: 'Magical' },                            // Venom Shell
  515: { class: 'Magical', stat: 'INT' },               // Maelstrom
  517: { class: 'Skill' },                              // Metallic Body
  519: { class: 'Physical', stat: 'MND' },              // Screwdriver
  521: { class: 'Magical' },                            // MP Drainkiss
  522: { class: 'Magical', stat: 'INT' },               // Death Ray
  524: { class: 'Magical' },                            // Sandspin
  527: { class: 'Physical', stat: 'DEX' },              // Smite of Rage
  529: { class: 'Physical', stat: 'CHR' },              // Bludgeon
  530: { class: 'Buff' },                               // Refueling
  531: { class: 'Magical', stat: 'INT' },               // Ice Break
  532: { class: 'Stun' },                               // Blitzstrahl
  533: { class: 'Breath' },                             // Self-Destruct
  534: { class: 'Magical', stat: 'CHR' },               // Mysterious Light
  535: { class: 'Magical' },                            // Cold Wave
  536: { class: 'Breath' },                             // Poison Breath
  537: { class: 'Magical' },                            // Stinking Gas
  538: { class: 'Buff' },                               // Memento Mori
  539: { class: 'Physical', stat: 'DEX' },              // Terror Touch
  540: { class: 'Physical', stat: 'STR' },              // Spinal Cleave
  541: { class: 'Magical' },                            // Blood Saber
  542: { class: 'Magical' },                            // Digest
  543: { class: 'Physical', stat: 'INT' },              // Mandibular Bite
  544: { class: 'Magical', stat: 'INT' },               // Cursed Sphere
  545: { class: 'Physical', stat: 'DEX' },              // Sickle Slash
  547: { class: 'Buff' },                               // Cocoon
  548: { class: 'Magical' },                            // Filamented Hold
  549: { class: 'Healing' },                            // Pollen
  551: { class: 'Physical', stat: 'VIT' },              // Power Attack
  554: { class: 'Physical', stat: 'STR' },              // Death Scissors
  555: { class: 'Breath' },                             // Magnetite Cloud
  557: { class: 'Magical', stat: 'CHR' },               // Eyes On Me
  560: { class: 'Physical', stat: 'DEX' },              // Frenetic Rip
  561: { class: 'Magical' },                            // Frightful Roar
  563: { class: 'Magical', stat: 'MND' },               // Hecatomb Wave
  564: { class: 'Physical', stat: 'VIT' },              // Body Slam
  565: { class: 'Breath' },                             // Radiant Breath
  567: { class: 'Physical', stat: 'AGI' },              // Helldive
  569: { class: 'Physical', stat: 'AGI' },              // Jet Stream
  570: { class: 'Magical' },                            // Blood Drain
  572: { class: 'Magical' },                            // Sound Blast
  573: { class: 'Magical' },                            // Feather Tickle
  574: { class: 'Buff' },                               // Feather Barrier
  575: { class: 'Magical' },                            // Jettatura
  576: { class: 'Magical' },                            // Yawn
  577: { class: 'Physical', stat: 'STR' },              // Foot Kick
  578: { class: 'Healing' },                            // Wild Carrot
  579: { class: 'Magical' },                            // Voracious Trunk
  581: { class: 'Healing' },                            // Healing Breeze
  582: { class: 'Magical' },                            // Chaotic Eye
  584: { class: 'Magical' },                            // Sheep Song
  585: { class: 'Physical', stat: 'MND' },              // Ram Charge
  587: { class: 'Physical', stat: 'DEX' },              // Claw Cyclone
  588: { class: 'Magical' },                            // Lowing
  589: { class: 'Physical', stat: 'STR' },              // Dimensional Death
  591: { class: 'Breath' },                             // Heat Breath
  592: { class: 'Magical' },                            // Blank Gaze
  593: { class: 'Healing' },                            // Magic Fruit
  594: { class: 'Physical', stat: 'STR' },              // Uppercut
  595: { class: 'Magical' },                            // 1000 Needles
  596: { class: 'Physical', stat: 'AGI' },              // Pinecone Bomb
  597: { class: 'Physical', stat: 'VIT' },              // Sprout Smack
  598: { class: 'Magical' },                            // Soporific
  599: { class: 'Physical', stat: 'INT' },              // Queasyshroom
  603: { class: 'Physical', stat: 'AGI' },              // Wild Oats
  604: { class: 'Breath' },                             // Bad Breath
  605: { class: 'Magical' },                            // Geist Wall
  606: { class: 'Magical' },                            // Awful Eye
  608: { class: 'Breath' },                             // Frost Breath
  610: { class: 'Magical' },                            // Infrasonics
  611: { class: 'Physical', stat: 'DEX' },              // Disseverment
  612: { class: 'Magical' },                            // Actinic Burst
  613: { class: 'Skill' },                              // Reactor Cool
  614: { class: 'Buff' },                               // Saline Coat
  615: { class: 'Skill' },                              // Plasma Charge
  616: { class: 'Stun' },                               // Temporal Shift
  617: { class: 'Physical', stat: 'STR' },              // Vertical Cleave
  618: { class: 'Magical', stat: 'INT' },               // Blastbomb
  620: { class: 'Physical', stat: 'STR' },              // Battle Dance
  621: { class: 'Magical' },                            // Sandspray
  622: { class: 'Physical', stat: 'VIT' },              // Grand Slam
  623: { class: 'Stun' },                               // Head Butt
  626: { class: 'Magical', stat: 'INT' },               // Bomb Toss
  628: { class: 'Stun' },                               // Frypan
  629: { class: 'Breath' },                             // Flying Hip Press
  631: { class: 'Physical', stat: 'AGI' },              // Hydro Shot
  632: { class: 'Skill' },                              // Diamondhide
  633: { class: 'Magical' },                            // Enervation
  634: { class: 'Magical' },                            // Light of Penance
  636: { class: 'Buff' },                               // Warm-Up
  637: { class: 'Magical', stat: 'INT' },               // Firespit
  638: { class: 'Physical', stat: 'AGI' },              // Feather Storm
  640: { class: 'Stun' },                               // Tail Slap
  641: { class: 'Physical', stat: 'DEX' },              // Hysteric Barrage
  642: { class: 'Buff' },                               // Amplification
  643: { class: 'Physical', stat: 'VIT' },              // Cannonball
  644: { class: 'Magical', stat: 'MND' },               // Mind Blast
  645: { class: 'Buff' },                               // Exuviation
  646: { class: 'Magical', stat: 'MND' },               // Magic Hammer
  647: { class: 'Buff' },                               // Zephyr Mantle
  648: { class: 'Magical', stat: 'INT' },               // Regurgitation
  650: { class: 'Physical', stat: 'DEX' },              // Seedspray
  651: { class: 'Magical', stat: 'INT' },               // Corrosive Ooze
  652: { class: 'Physical', stat: 'AGI' },              // Spiral Spin
  653: { class: 'Physical', stat: 'DEX' },              // Asuran Claws
  654: { class: 'Physical', stat: 'VIT' },              // Sub-zero Smash
  655: { class: 'Buff' },                               // Triumphant Roar
  656: { class: 'Magical', stat: 'MND' },               // Acrid Stream
  657: { class: 'Magical', stat: 'INT' },               // Blazing Bound
  658: { class: 'Healing' },                            // Plenilune Embrace
  659: { class: 'Magical' },                            // Demoralizing Roar
  660: { class: 'Magical' },                            // Cimicine Discharge
  661: { class: 'Buff' },                               // Animating Wail
  662: { class: 'Buff' },                               // Battery Charge
  663: { class: 'Magical', stat: 'INT' },               // Leafstorm
  664: { class: 'Buff' },                               // Regeneration
  665: { class: 'Physical' },                           // Final Sting
  666: { class: 'Physical', stat: 'DEX' },              // Goblin Rush
  667: { class: 'Physical', stat: 'DEX' },              // Vanity Dive
  668: { class: 'Skill' },                              // Magic Barrier
  669: { class: 'Stun' },                               // Whirl of Rage
  670: { class: 'Physical', stat: 'AGI' },              // Benthic Typhoon
  671: { class: 'Magical' },                            // Auroral Drape
  672: { class: 'Magical' },                            // Osmosis
  673: { class: 'Physical', stat: 'VIT' },              // Quad. Continuum
  674: { class: 'Buff' },                               // Fantod
  675: { class: 'Magical', stat: 'VIT' },               // Thermal Pulse
  677: { class: 'Physical', stat: 'STR' },              // Empty Thrash
  678: { class: 'Magical' },                            // Dream Flower
  679: { class: 'Buff' },                               // Occultation
  680: { class: 'Magical', stat: 'DEX' },               // Charged Whisker
  681: { class: 'Buff' },                               // Winds of Promy.
  682: { class: 'Physical', stat: 'VIT' },              // Delta Thrust
  683: { class: 'Magical', stat: 'MND' },               // Evryone. Grudge
  684: { class: 'Magical' },                            // Reaving Wind
  685: { class: 'Skill' },                              // Barrier Tusk
  686: { class: 'Magical' },                            // Mortal Ray
  687: { class: 'Magical', stat: 'INT' },               // Water Bomb
  688: { class: 'Physical', stat: 'STR' },              // Heavy Strike
  689: { class: 'Magical', stat: 'INT' },               // Dark Orb
  690: { class: 'Healing' },                            // White Wind
  692: { class: 'Stun' },                               // Sudden Lunge
  693: { class: 'Physical', stat: 'STR' },              // Quadrastrike
  694: { class: 'Breath' },                             // Vapor Spray
  695: { class: 'Breath' },                             // Thunder Breath
  696: { class: 'Buff' },                               // O. Counterstance
  697: { class: 'Physical', stat: 'DEX' },              // Amorphic Spikes
  698: { class: 'Breath' },                             // Wind Breath
  699: { class: 'Physical', stat: 'DEX' },              // Barbed Crescent
  700: { class: 'Buff' },                               // Nat. Meditation
  701: { class: 'Magical', stat: 'AGI' },               // Tem. Upheaval
  702: { class: 'Magical', stat: 'VIT' },               // Rending Deluge
  703: { class: 'Magical', stat: 'VIT' },               // Embalming Earth
  704: { class: 'Physical', stat: 'DEX' },              // Paralyzing Triad
  705: { class: 'Magical', stat: 'MND' },               // Foul Waters
  706: { class: 'Physical', stat: 'VIT' },              // Glutinous Dart
  707: { class: 'Magical', stat: 'INT' },               // Retinal Glare
  708: { class: 'Magical', stat: 'VIT' },               // Subduction
  709: { class: 'Physical', stat: 'DEX' },              // Thrashing Assault
  710: { class: 'Buff' },                               // Erratic Flutter
  711: { class: 'Healing' },                            // Restoral
  712: { class: 'Magical', stat: 'MND' },               // Rail Cannon
  713: { class: 'Magical', stat: 'MND' },               // Diffusion Ray
  714: { class: 'Physical', stat: 'STR' },              // Sinker Drill
  715: { class: 'Magical', stat: 'AGI' },               // Molting Plumage
  716: { class: 'Magical', stat: 'MND' },               // Nectarous Deluge
  717: { class: 'Physical', stat: 'VIT' },              // Sweeping Gouge
  718: { class: 'Magical' },                            // Atra. Libations
  719: { class: 'Magical', stat: 'STR' },               // Searing Tempest
  720: { class: 'Magical', stat: 'INT' },               // Spectral Floe
  721: { class: 'Magical', stat: 'DEX' },               // Anvil Lightning
  722: { class: 'Magical', stat: 'VIT' },               // Entomb
  723: { class: 'Physical' },                           // Saurian Slide
  724: { class: 'Magical', stat: 'AGI' },               // Palling Salvo
  725: { class: 'Magical', stat: 'STR' },               // Blinding Fulgor
  726: { class: 'Magical', stat: 'MND' },               // Scouring Spate
  727: { class: 'Magical', stat: 'AGI' },               // Silent Storm
  728: { class: 'Magical', stat: 'INT' },               // Tenebral Crush
  736: { class: 'Stun', unbridled: true },              // Thunderbolt
  737: { class: 'Skill', unbridled: true },             // Harden Shell
  738: { class: 'Magical', unbridled: true },           // Absolute Terror
  739: { class: 'Magical', stat: 'DEX', unbridled: true },// Gates of Hades
  740: { class: 'Physical', stat: 'MND', unbridled: true },// Tourbillion
  741: { class: 'Skill', unbridled: true },             // Pyric Bulwark
  742: { class: 'Physical', unbridled: true },          // Bilgestorm
  743: { class: 'Physical', stat: 'STR', unbridled: true },// Bloodrake
  744: { class: 'Magical', unbridled: true },           // Droning Whirlwind
  745: { class: 'Buff', unbridled: true },              // Carcharian Verve
  746: { class: 'Magical', unbridled: true },           // Blistering Roar
  747: { class: 'Magical', stat: 'VIT', unbridled: true },// Uproot
  748: { class: 'Magical', stat: 'AGI', unbridled: true },// Crashing Thunder
  749: { class: 'Magical', stat: 'INT', unbridled: true },// Polar Roar
  750: { class: 'Buff', unbridled: true },              // Mighty Guard
  751: { class: 'Magical', unbridled: true },           // Cruel Joke
  752: { class: 'Magical', stat: 'INT', unbridled: true },// Cesspool
  753: { class: 'Magical', stat: 'INT', unbridled: true },// Tearing Gust
}
