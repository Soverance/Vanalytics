# FFXI Vanalytics

Vana'diel + Analytics

A Final Fantasy XI character progress tracker.

# Requirements

* An installed and updated official version of Final Fantasy XI
* * http://www.playonline.com/ff11us/download/media/install_win.html
* Windower 4 (stable)
* * https://docs.windower.net/

# Recommended Windower Extensions

## Addons

https://docs.windower.net/addons/

* Craft   
* Distance  
* GearSwap  
* TargetInfo (specific use case)
* Timestamp  (best for HNM ToD)
* TParty  

## Plugins

https://docs.windower.net/plugins/

* AutoExec   
* DelayMeNot 
* WinControl

## Gameplay Tips

### Crafting Automation
Crafting in FFXI is slow as shit.  When you're faced with crafting a ton of the same items over and over again... well, it's just a dreadful task.  The Windower Add-On "craft" can help automate it, and relieve much of this pain.

https://docs.windower.net/addons/craft/

To show the help text in game, enter this command into the console:

`//craft help`

When you read that help command, it'll describe how to modify the "recipes.lua" file to allow automation of new recipes.  To do so:

* in a text editor, open `{{ windower_install_dir }}\addons\craft\recipes.lua`
* in game, enter console command:  `//craft display`
*This will make the craft packet data display in the game's chat log when you manually craft an item*
* Use the data shown from the packet display of a manual craft to modify the recipes.lua, adding a new recipe to the existing array
*Note that you can name the new recipe anything you want, it's only a name reference for the 'craft' windower add-on and not a reference to whatever the game would call that recipe*

Once you've modified the recipes.lua, you must reload the 'craft' add-on.  In the console, enter:

`//lua reload craft`

Now you can use the add-on for automated crafting.  In the console, enter:

`//craft make {[ your_recipe_name ]} {{ number_to_make }}`

for example, if you made a recipe called "Desynth 2", and wanted to perform the synth 20 times, you would enter:   `//craft make "Desynth 2" 20`

With the most recent crafting command having been run via the 'craft' add-on, you can automate the rest of your crafting with the 'repeat' switch (sometimes this doesn't seem to work correctly):

`//craft repeat 48`

where '48' is the number of crafting attempts you wish to repeat.  Make sure you have enough items and inventory space!

### Alexandrite Farming
Do Salvage, specifically Arrapago Remnants II.  Essentially you unlock all your gear + stats, spawn the Dvergr on Floor 4, and battle the Bloodthirsty Dweorg as the final boss for a 100% drop rate on a Linen Coin Purse (1-99 alex).  See the [BGWiki article](https://www.bg-wiki.com/ffxi/Silver_Sea_Remnants_II) for more specific details.

### Abyssea 
NM key item farming requires a red proc on the mob in question.

* Greatsword    = Freezebite (ice)
* Staff         = Earth Crusher (earth)
* Polearm       = Raiden Thrust (lightning)
* Scythe        = Shadow of Death (dark)

### Dynamis
Best to farm CoP dynamis zones, like Buburimu/Qufim/Valkurm.

Go as THF/DNC.  Keep subjobs unlocked.  Equip low iLvl weapons.  Empty your inventory, 50+ free slots.  

If you have all 3 DNC trusts, you can go with subjobs locked, which allows for a white proc with 100% chance on a hundred piece.  You'll be relying mostly on the trusts to proc in this case.

First thing once inside, get all 5 time extensions.  This is required before attempting red procs, as they will not appear otherwise.

In Buburimu, you should also kill all the dragons, as they have high drop rates on hundred pieces.

Attempt JA procs, with the following abilities.  The order listed here is their cooldown order for optimal timing.

* Box Step  (primary JA to use for procs)
* Violent Flourish
* Box Step
* Bully
* Box Step
* Mug
* Box Step
* Despoil
* Box Step
* Violent Flourish
* Box Step

Once proc'd, go ahead and immediately kill the mob with a weapon skill.

Buburimu camp route:

* 00:00 - 08:00 Crawlers, Ravens, Urganites
* 08:00 - 16:00 Mandies, Bunnies, Efts
* 16:00 - 24:00 Scorpions, Crabs, Dhalmels

Typically the route goes Raven -> Mandy -> Scorpions

You need sneak/invis macro.

For trusts you typically want to use the DNC trusts, which are:

* Uka Totlihn  (already have on sov)
* Mumor  (Sunbreeze Festival, should be in August)
* Mayakov  (already have on sov)
* Cherukiki
* Yoran-Oran

## Ultimate Weapon Progress
Soverance

* Vajra (119)
* Mandau (119 afterglow)
* Kartika (75, need to do Glavoids to turn it into a Twashtar)
* Tizona (119 afterglow)
* Almace (119 afterglow)
* Excalibur (75)
* Ukonvasara (90)
* Apocalypse (75)
* Kikoku (80)
* Amanomurakumo (75)
* Yoichinoyumi (75)
* Annihilator (99)
* Gjallarhorn (75)
* Aegis (99)
* Ochain (90)
* Toreutic Shield (stage 4, 24.2%)

## AREA ZONE DAT FILE HEX DATA 
In some cases, you can modify enemy mob names directly in the hex files.  This can make placeholder enemies more easily identified via widescan while in game.  You need to open the DAT files in a hex editor, and modify them accordingly.  The game must be reloaded after a DAT file is modified for the changes to take effect.  The following list is the DAT file locations and their corresponding zone names.  Find these files in the base FFXI installation directory:

`{{ ffxi_install_dir }}\SquareEnix\FINAL FANTASY XI\`

### Area DAT File Reference

<details>
    <summary>====== Original Areas ======</summary>

```
ROM/26/37.dat -- West Ronfaure

ROM/26/38.dat -- East Ronfaure

ROM/26/39.dat -- La Theine Plateau

ROM/26/40.dat -- Valkurm Dunes

ROM/26/41.dat -- Jugner Forest

ROM/26/42.dat -- Batallia Downs

ROM/26/43.dat -- North Gustaberg

ROM/26/44.dat -- South Gustaberg

ROM/26/45.dat -- Konschtat Highlands

ROM/26/46.dat -- Pashhow Marshlands

ROM/26/47.dat -- Rolanberry Fields

ROM/26/48.dat -- Beaucedine Glacier

ROM/26/49.dat -- Xarcabard

ROM/26/52.dat -- West Sarutabaruta

ROM/26/53.dat -- East Sarutabaruta

ROM/26/54.dat -- Tahrongi Canyon

ROM/26/55.dat -- Buburimu Peninsula

ROM/26/56.dat -- Meriphataud Mountains

ROM/26/57.dat -- Sauromugue Champaign

ROM/26/63.dat -- Qufim Island

ROM/26/64.dat -- Behemoth's Dominion

ROM/26/76.dat -- Horlais Peak

ROM/26/77.dat -- Ghelsba Outpost

ROM/26/78.dat -- Fort Ghelsba

ROM/26/79.dat -- Yughott Grotto

ROM/26/80.dat -- Palborough Mines

ROM/26/81.dat -- Waughroon Shrine

ROM/26/82.dat -- Giddeus

ROM/26/83.dat -- Balga's Dais

ROM/26/84.dat -- Beadeaux

ROM/26/85.dat -- Qulun Dome

ROM/26/86.dat -- Davoi

ROM/26/87.dat -- Monastic Cavern

ROM/26/88.dat -- Castle Oztroja

ROM/26/89.dat -- Altar Room

ROM/26/94.dat -- Middle Delkfutt's Tower

ROM/26/95.dat -- Upper Delkfutt's Tower

ROM/26/98.dat -- Castle Zvahl Baileys

ROM/26/99.dat -- Castle Zvahl Keep

ROM/26/102.dat -- Throne Room

ROM/26/103.dat -- Ranguemont Pass

ROM/26/104.dat -- Bostaunieux Oubliette

ROM/26/106.dat -- Toraimarai Canal

ROM/26/109.dat -- Zeruhn Mines

ROM/26/121.dat -- Lower Delkfutt's Tower

ROM/26/127.dat -- King Ranperre's Tomb

ROM/27/0.dat -- Dangruf Wadi

ROM/27/1.dat -- Inner Horutoto Ruins

ROM/27/2.dat -- Ordelle's Caves

ROM/27/3.dat -- Outer Horutoto Ruins

ROM/27/4.dat -- The Eldieme Necropolis

ROM/27/5.dat -- Gusgen Mines

ROM/27/6.dat -- Crawlers' Nest

ROM/27/7.dat -- Maze of Shakhrami

ROM/27/9.dat -- Garlaige Citadel

ROM/27/13.dat -- Fei'Yin

ROM/27/15.dat -- Qu'Bia Arena

ROM/27/29.dat -- Ship bound for Selbina

ROM/27/30.dat -- Ship bound for Mhaura

ROM/27/32.dat -- San d'Oria-Jeuno Airship

ROM/27/33.dat -- Bastok-Jeuno Airship

ROM/27/34.dat -- Windurst-Jeuno Airship

ROM/27/36.dat -- Ship bound for Selbina

ROM/27/37.dat -- Ship bound for Mhaura

ROM/27/39.dat -- Southern San d'Oria

ROM/27/40.dat -- Northern San d'Oria

ROM/27/41.dat -- Port San d'Oria

ROM/27/42.dat -- Chateau d'Oraguille

ROM/27/43.dat -- Bastok Mines

ROM/27/44.dat -- Bastok Markets

ROM/27/45.dat -- Port Bastok

ROM/27/46.dat -- Metalworks

ROM/27/47.dat -- Windurst Waters

ROM/27/48.dat -- Windurst Walls

ROM/27/49.dat -- Port Windurst

ROM/27/50.dat -- Windurst Woods

ROM/27/51.dat -- Heavens Tower

ROM/27/52.dat -- Ru'Lude Gardens

ROM/27/53.dat -- Upper Jeuno

ROM/27/54.dat -- Lower Jeuno

ROM/27/55.dat -- Port Jeuno

ROM/27/57.dat -- Selbina

ROM/27/58.dat -- Mhaura
```

</details>

<details>
    <summary>====== Rise of the Zilart Areas ======</summary>

```
ROM2/13/95.dat -- Cape Teriggan

ROM2/13/96.dat -- Eastern Altepa Desert

ROM2/13/97.dat -- The Sanctuary of Zi'Tah

ROM2/13/98.dat -- Ro'Maeve

ROM2/13/99.dat -- Yuhtunga Jungle

ROM2/13/100.dat -- Yhoator Jungle

ROM2/13/101.dat -- Western Altepa Desert

ROM2/13/102.dat -- Valley of Sorrows

ROM2/13/103.dat -- Ru'Aun Gardens

ROM2/13/104.dat -- Dynamis - Beaucedine

ROM2/13/105.dat -- Dynamis - Xarcabard

ROM2/13/106.dat -- The Boyahda Tree

ROM2/13/107.dat -- Dragon's Aery

ROM2/13/108.dat -- Temple of Uggalepih

ROM2/13/109.dat -- Den of Rancor

ROM2/13/110.dat -- Sacrificial Chamber

ROM2/13/111.dat -- Chamber of Oracles

ROM2/13/112.dat -- Full Moon Fountain

ROM2/13/113.dat -- Korroloka Tunnel

ROM2/13/114.dat -- Kuftal Tunnel

ROM2/13/115.dat -- Sea Serpent Grotto

ROM2/13/116.dat -- Ve'Lugannon Palace

ROM2/13/117.dat -- The Shrine of Ru'Avitau

ROM2/13/118.dat -- Stellar Fulcrum

ROM2/13/119.dat -- La'Loff Amphitheater

ROM2/13/120.dat -- The Celestial Nexus

ROM2/13/121.dat -- Dynamis - San d'Oria

ROM2/13/122.dat -- Dynamis - Bastok

ROM2/13/123.dat -- Dynamis - Windurst

ROM2/13/124.dat -- Dynamis - Jeuno

ROM2/13/125.dat -- Cloister of Gales

ROM2/13/126.dat -- Cloister of Storms

ROM2/13/127.dat -- Cloister of Frost

ROM2/14/0.dat -- Ifrit's Cauldron

ROM2/14/1.dat -- Cloister of Flames

ROM2/14/2.dat -- Quicksand Caves

ROM2/14/3.dat -- Cloister of Tremors

ROM2/14/4.dat -- Cloister of Tides

ROM2/14/5.dat -- Gustav Tunnel

ROM2/14/6.dat -- Labyrinth of Onzozo

ROM2/14/7.dat -- Kazham-Jeuno Airship

ROM2/14/8.dat -- Rabao

ROM2/14/9.dat -- Kazham

ROM2/14/10.dat -- Hall of the Gods

ROM2/14/11.dat -- Norg
```

</details>

<details>
    <summary>====== Chain of Promathia Areas ======</summary>

```
ROM3/2/111.dat -- Phanauet Channel

ROM3/2/112.dat -- Carpenters' Landing

ROM3/2/113.dat -- Manaclipper

ROM3/2/114.dat -- Bibiki Bay

ROM3/2/115.dat -- Uleguerand Range

ROM3/2/116.dat -- Bearclaw Pinnacle

ROM3/2/117.dat -- Attohwa Chasm

ROM3/2/118.dat -- Boneyard Gully

ROM3/2/119.dat -- Pso'Xja

ROM3/2/120.dat -- The Shrouded Maw

ROM3/2/121.dat -- Oldton Movalpolos

ROM3/2/122.dat -- Newton Movalpolos

ROM3/2/123.dat -- Mine Shaft #2716

ROM3/2/124.dat -- Hall of Transference

ROM3/2/126.dat -- Promyvion-Holla

ROM3/2/127.dat -- Spire of Holla

ROM3/3/0.dat -- Promyvion-Dem

ROM3/3/1.dat -- Spire of Dem

ROM3/3/2.dat -- Promyvion-Mea

ROM3/3/3.dat -- Spire of Mea

ROM3/3/4.dat -- Promyvion-Vahzl

ROM3/3/5.dat -- Spire of Vahzl

ROM3/3/6.dat -- Lufiase Meadows

ROM3/3/7.dat -- Misareaux Coast

ROM3/3/8.dat -- Tavnazian Safehold

ROM3/3/9.dat -- Phomiuna Aqueducts

ROM3/3/10.dat -- Sacrarium

ROM3/3/11.dat -- Riverne - Site #B01

ROM3/3/12.dat -- Riverne - Site #A01

ROM3/3/13.dat -- Monarch Linn

ROM3/3/14.dat -- Sealion's Den

ROM3/3/15.dat -- Al'Taieu

ROM3/3/16.dat -- Grand Palace of Hu'Xzoi

ROM3/3/17.dat -- The Garden of Ru'Hmet

ROM3/3/18.dat -- Empyreal Paradox

ROM3/3/19.dat -- Temenos

ROM3/3/20.dat -- Apollyon

ROM3/3/21.dat -- Dynamis - Valkurm

ROM3/3/22.dat -- Dynamis - Buburimu

ROM3/3/23.dat -- Dynamis - Qufim

ROM3/3/24.dat -- Dynamis - Tavnazia

ROM3/3/25.dat -- Diorama Abdhaljs-Ghelsba

ROM3/3/26.dat -- Abdhaljs Isle-Purgonorgo
```

</details>

<details>
    <summary>====== Treasure of Aht Urgan ======</summary>

```
ROM4/1/45.dat -- Open sea route to Al Zahbi

ROM4/1/46.dat -- Open sea route to Mhaura

ROM4/1/47.dat -- Al Zahbi

ROM4/1/49.dat -- Aht Urhgan Whitegate

ROM4/1/50.dat -- Wajaom Woodlands

ROM4/1/51.dat -- Bhaflau Thickets

ROM4/1/52.dat -- Nashmau

ROM4/1/53.dat -- Arrapago Reef

ROM4/1/54.dat -- Ilrusi Atoll

ROM4/1/55.dat -- Periqia

ROM4/1/56.dat -- Talacca Cove

ROM4/1/57.dat -- Silver Sea route to Nashmau

ROM4/1/58.dat -- Silver Sea route to Al Zahbi

ROM4/1/59.dat -- The Ashu Talif

ROM4/1/60.dat -- Mount Zhayolm

ROM4/1/61.dat -- Halvung

ROM4/1/62.dat -- Lebros Cavern

ROM4/1/63.dat -- Navukgo Execution Chamber

ROM4/1/64.dat -- Mamook

ROM4/1/65.dat -- Mamool Ja Training Grounds

ROM4/1/66.dat -- Jade Sepulcher

ROM4/1/67.dat -- Aydeewa Subterrane

ROM4/1/68.dat -- Leujaoam Sanctum

ROM4/1/69.dat -- Chocobo Circuit

ROM4/1/70.dat -- The Colosseum

ROM4/1/71.dat -- Alzadaal Undersea Ruins

ROM4/1/72.dat -- Zhayolm Remnants

ROM4/1/73.dat -- Arrapago Remnants

ROM4/1/74.dat -- Bhaflau Remnants

ROM4/1/75.dat -- Silver Sea Remnants

ROM4/1/76.dat -- Nyzul Isle

ROM4/1/77.dat -- Hazhalm Testing Grounds

ROM4/1/78.dat -- Caedarva Mire
```

</details>

## TRUST COMPLETION CHECKLIST
This checklist only looks at the Soverance character - I don't care about trusts on Monarc or any other character.

<details>
    <summary>====== Trust List ======</summary>

```
| Cherukiki         = Complete
| Ferreous Coffin   = COMPLETE
| Karaha-Baruha     = COMPLETE
| Kupipi            = COMPLETE
| Mihli Aliapoh     = COMPLETE
| Ygnas             = 
| Amchuchu          = COMPLETE
| Ark Angel EV      = COMPLETE
| Ark Angel HM      = 
| August            = COMPLETE
| Curilla           = COMPLETE
| Gessho            = COMPLETE
| Mnejing           = COMPLETE
| Rahal             = COMPLETE
| Rughadjeen        = COMPLETE
| Trion             = COMPLETE
| Valaineral        = COMPLETE
| Arciela           = COMPLETE
| Arciela II        = COMPLETE
| Joachim           = COMPLETE
| King of Hearts    = COMPLETE
| Koru-Moru         = COMPLETE
| Qultada           = COMPLETE
| Ulmia             = COMPLETE
| Adelheid          = COMPLETE
| Ajido-Marujido    = COMPLETE
| Ark Angel TT      = 
| Domina Shantotto  = COMPLETE
| Gadalar           = 
| Ingrid            = 
| Kayeel-Payeel     = COMPLETE
| Kukki-Chebukki    = 
| Leonoyne          = 
| Mumor II          = 
| Ovjang            = COMPLETE
| Robel-Akbel       = COMPLETE
| Rosulatia         = COMPLETE
| Shantotto         = COMPLETE
| Shantotto II      = COMPLETE
| Ullegore          = COMPLETE
| Elivira           = 
| Makki-Chebukki    = COMPLETE
| Margret           = 
| Najelith          = COMPLETE
| Semih Lafihna     = COMPLETE
| Tenzen II         = COMPLETE
| Brygid            = COMPLETE
| Kupofried         = COMPLETE
| Kuyin Hathdenna   = COMPLETE
| Moogle            = COMPLETE
| Sakura            = COMPLETE
| Star Sibyl        = COMPLETE
| Abenzio           = COMPLETE
| Abquhbah          = COMPLETE
| Aldo              = COMPLETE
| Areuhat           = COMPLETE
| Ark Angel GK      = COMPLETE
| Ark Angel MR      = 
| Ayame             = COMPLETE
| Babban Mheillea   = 
| Balamor           = COMPLETE
| Chacharoon        = 
| Cid               = COMPLETE
| Darrcuiln         = COMPLETE
| Excenmille        = COMPLETE
| Excenmille (S)    = 
| Fablinix          = 
| Gilgamesh         = COMPLETE
| Halver            = COMPLETE
| Ingrid II         = COMPLETE
| Iroha             = COMPLETE
| Iroha II          = COMPLETE
| Iron Eater        = COMPLETE
| Klara             = 
| Lehko Habhoka     = COMPLETE
| Lhe Lhangavo      = COMPLETE
| Lhu Mhakaracca    = COMPLETE
| Lilisette         = COMPLETE
| Lilisette II      = COMPLETE
| Lion              = COMPLETE
| Lion II           = COMPLETE
| Luzaf             = COMPLETE
| Maat              = COMPLETE
| Maximilian        = 
| Mayakov           = COMPLETE
| Mildaurion        = COMPLETE
| Monberaux         =
| Morimar           = COMPLETE
| Mumor             = 
| Naja Salaheem     = COMPLETE
| Naji              = COMPLETE
| Nanaa Mihgo       = COMPLETE
| Nashmeira         = COMPLETE
| Nashmeira II      = COMPLETE
| Noillurie         = COMPLETE
| Prishe            = 
| Prishe II         = COMPLETE
| Rainemard         = COMPLETE
| Romaa Mihgo       = 
| Rongelouts        = COMPLETE
| Selh'teus         = COMPLETE
| Shikaree Z        =
| Tenzen            = COMPLETE
| Teodor            = COMPLETE
| Uka Totlihn       = COMPLETE
| Volker            = COMPLETE
| Zazarg            = COMPLETE
| Zeid              = COMPLETE
| Zeid II           = COMPLETE
```

</details>
