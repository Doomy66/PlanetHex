# PlanetHex Subsectors

A subsector of star systems generated from one seed, drawn as the standard eighty hex map, where every world is a PlanetHex planet waiting to be opened.

This document is the companion to [PlanetSpec.md](PlanetSpec.md) and is numbered the same way, so the code can cite either. Where a clause here says *the planet spec*, it means that document.

## Contents

1. [Purpose](#1-purpose)
2. [The hex grid](#2-the-hex-grid)
3. [Generating a system](#3-generating-a-system)
4. [Display](#4-display)
5. [Subsector data and persistence](#5-subsector-data-and-persistence)
6. [Exporting the subsector](#6-exporting-the-subsector)
7. [Where a hex becomes a planet](#7-where-a-hex-becomes-a-planet)
8. [Build order](#8-build-order)
9. [Open questions](#9-open-questions)

---

## 1. Purpose

1.1 The application generates a subsector of star systems from a seed and displays it as the eighty hex map Traveller draws a subsector on. Each hex either holds a system or is empty space.

1.2 A subsector is a seed, a name, a handful of settings, and whatever the user has typed over the top of what was rolled. Nothing generated is stored, so a subsector travels as a short piece of JSON exactly as a planet does under the planet spec 1.3.

1.3 Every world on the subsector is a planet of the planet spec. Its seed is derived from the subsector's, so clicking a hex opens a world with terrain, a globe, and a local panel, and its profile is the profile that seed produces whether it was reached through the subsector or opened on its own.

1.3.1 This is the whole point of the feature, and it constrains section 3 more than anything else here. The subsector does not invent worlds. It decides *where* worlds are and then names the seeds that generate them, and the profile it shows for a world is the profile the planet spec 6.7.2 would roll for that seed, digit for digit. A subsector that rolled its own UWPs would be a second world generator wearing the first one's map, and the two would disagree the moment a user opened a hex.

1.4 What the subsector adds beyond the planet spec is the rest of the system: the star or stars, the belts and the gas giants, the bases, and the travel zone. None of it reaches the surface generator, for the reason in 3.8.2. Where the system level takes over from the subsector, see 3.8.3.

1.5 The application uses Traveller's terms and formats where they are the clearest way to describe what it does, as the planet spec 1.1.1 has it. No sector, subsector, world, or name from any published setting is reproduced.

## 2. The hex grid

### 2.1 Shape

2.1.1 A subsector is 8 columns across and 10 rows down, eighty hexes. That is a quarter of a sector map across and a quarter down, which is what makes sixteen of them a sector, and it is already in the code: `SUB_COLS` and `SUB_ROWS` in [src/location.ts](src/location.ts).

2.1.2 The hexes are drawn in the Traveller convention: flat columns of pointy-topped hexes, column 01 on the left, odd columns sitting half a hex higher than even ones, row 01 at the top. This is the opposite convention from the surface hexes of the planet spec section 2, and deliberately not shared with them.

2.1.3 A subsector hex is one star system. A surface hex is a piece of ground on one planet. The planet spec 6.14.3 already says these two grids have nothing to do with each other, and no code should be shared between them beyond the four digit parsing of 2.2.

### 2.2 Where a subsector sits

2.2.1 A subsector carries the sector it belongs to, free text as the planet spec 6.14 has it, and its letter, A to P. Those two are what a world's four digit hex is read against.

2.2.2 Hexes are held and shown sector-absolute, 0101 to 3240, not numbered 0101 to 0810 within the subsector. `parseSectorHex` and `subsectorLetter` in [src/location.ts](src/location.ts) stay the single authority on what a hex means, and a world exported from subsector G lands on the sector map where subsector G is rather than on top of subsector A.

2.2.2.1 The alternative, local numbering with an offset applied at export, was rejected because the offset would then exist in two places: in the export and in whatever the user reads off the screen. A referee who writes down 1914 wants to find 1914 later.

2.2.3 The letter is chosen rather than derived, because here it is the thing known first and the hex range follows from it. This is the reverse of the planet spec 6.14.2, where a hex is known and the letter falls out of it, and the two are consistent: in both cases only one of the pair is typed.

2.2.4 A subsector with no letter chosen is treated as A, so a user who wants eighty worlds and does not care where they are gets them without answering a question first.

## 3. Generating a system

### 3.1 The seed chain

3.1.1 The subsector has a seed, in the form and alphabet of `randomSeed` in [src/planet.ts](src/planet.ts). Everything in the subsector descends from it.

3.1.2 Each hex draws its values from the streams of `valueFor` in [src/gen/rng.ts](src/gen/rng.ts), keyed on the subsector seed, the hex, and a named stream: presence, name, stars, bases, and so on. Per-hex and per-stream rather than a sequence, for the reason `valueFor` exists at all — nothing may depend on the order the eighty hexes are visited in.

3.1.3 A world's own seed is eight characters of the seed alphabet, derived by hashing the subsector seed with the hex. It is then handed to the planet generator untouched, and that is what 1.3.1 requires.

3.1.3.1 The derived seed is written into the world record and shown in the UI, so a user can copy it, open it alone, and get the same world. A seed that could not be read off the screen would make the claim of 1.3 untestable by the person who most wants to test it.

### 3.2 Whether a hex holds a system

3.2.1 Each hex draws one value in [0, 1) from its presence stream. A hex holds a system where that value is under the density threshold.

3.2.2 Density is a subsector setting with four choices: **Rift** at one hex in six, **Sparse** at one in three, **Standard** at one in two, and **Dense** at two in three. Standard is the default, and it is the 4+ on one die that Traveller's own maps are built to.

3.2.2.1 A threshold against a fixed per-hex value rather than a die roll per density, so that raising the density only ever adds systems and never moves the ones already there. A referee who has written notes on half a subsector and then decides the region should be busier keeps the half they wrote.

3.2.2.2 Lowering the density removes systems, and it removes the ones nearest the threshold. Where a removed system carries user edits under 5.3, it is kept and marked rather than dropped, and 5.3.4 says so.

3.2.3 The user can place a system in an empty hex and remove one from a full hex. Both are edits under 5.3, and neither changes the seed: a subsector is a starting point, and a referee who wants a world at 1914 should not have to reroll the other seventy-nine to get it.

### 3.3 The world

3.3.1 The main world's profile is `rollUwp(worldSeed)` from [src/planet.ts](src/planet.ts), unmodified. See 1.3.1.

3.3.1.1 This means the subsector carries no world-generation rules of its own, and a change to the planet generator changes the subsector with it. That is the intended coupling, not an accident of reuse.

3.3.2 The trade classifications are `tradeCodes` from [src/gen/trade.ts](src/gen/trade.ts), as the planet spec 6.16 already derives them.

3.3.3 The population multiplier, belts, and gas giants are `pbgFor` from the same file, on the world's own seed. The planet spec 6.16.2 calls these the one thing PlanetHex has nothing behind, and that is still true; what changes here is that they now sit beside seventy-nine others, so the same figures are being read as a region rather than as one line.

### 3.4 The name

3.4.1 A world is named from the machinery of the planet spec 6.24.6, which already generates names in five flavours and is already seeded. It moves out of [src/gen/settle.ts](src/gen/settle.ts) into a naming module both can call, since a world name and a city name are the same problem.

3.4.2 The subsector draws a dominant flavour, and each world follows it three times in four. The remaining quarter draws its own.

3.4.2.1 A region reads as a region when most of its names sound related, which is what a frontier settled from one direction actually looks like. All eighty from one flavour reads as a list generated by a program; all eighty independent reads as no history at all. Three in four is the mixture that sounds like somewhere.

3.4.3 A world is named as a world rather than as the first town on one. One of the ways of naming counts things — Camp One, Camp Two — which is right for the settlements of a single world and wrong for a world, since there are eight words to count with: a region that named things that way had forty worlds drawing on eight names, and the same four turned up in every subsector of a sector. A world takes the word after a name of its own instead, Vlanar Depot or Kadrin Station, which is how a working world is actually named and is thousands of names rather than eight.

3.4.4 No two worlds of a subsector are called the same thing. Every world draws from its own seed, so two of them landing on one name is unlikely and not impossible, and a referee saying "go to Kadrin" on a subsector with two Kadrins has a subsector with a mistake in it. The subsector is walked in hex order, the first world to claim a name keeps it, and the next draws again.

3.4.4.1 Kept to the subsector, and not carried up. A sector is sixteen subsectors, and renaming across them would make a subsector opened from a sector different from the same subsector opened on its own, which is the one thing [AppSpec.md](AppSpec.md) 1.3 does not allow. Across a sector a repeat is chance rather than a rule: with the pools of 3.4.3 it stays under one world in twenty, and two worlds a hundred hexes apart sharing a name is a thing real maps do.

3.4.3 Names are generated for the whole subsector at once so collisions can be dealt with, as 6.24.6 does for a world's settlements. Two worlds in one subsector with one name between them is worse than a name drawn twice.

### 3.5 Bases

3.5.1 Naval and scout bases are rolled against the starport class, by the SRD's own table: a naval base is possible only at class A and B, a scout base at A through D, neither anywhere else.

3.5.2 Bases are derived rather than invented, which is why they are here and the zone of 3.6 is more cautious. The profile already says what quality of port the world has, and the rules already say what a port of that quality can support.

3.5.3 The base codes go in the Bases column of the sector line, which [src/io/export/sec.ts](src/io/export/sec.ts) currently leaves blank.

### 3.6 The travel zone

3.6.1 Three things put a world in the running for an Amber zone. Its atmosphere is 10 or above — exotic, corrosive or insidious, so a landing party needs a suit and the suit may not last. Its government is 0, 7 or 10 — nobody to deal with, a dozen rival states none of whose permits the others honour, or one person whose mood is the law. Or its law level is 0 or 9 and above — no law at all, or so much of it that a crew will fall foul of something they did not know was a crime.

3.6.1.1 A world nobody lives on is never flagged, whatever its air. A zone is a warning posted about somewhere people go, and most of a subsector is rock nobody has been to — a warning on every one of them is a map of warnings and nothing else. Its government and law digits are blank rather than extreme for the same reason: there is nobody there to have no government.

3.6.2 Being in the running is not being flagged. Half a subsector qualifies on paper — twenty of its forty worlds — and a subsector where half the hexes carry a warning is a subsector where the warning means nothing. So a trigger buys a chance, and the chance is small: about one in fourteen for a world with one thing wrong with it, one in five with two, and two in five with all three.

3.6.2.1 Weighted by how many triggers a world has, rather than flat, because a corrosive world with no law and no government is genuinely more likely to have had somebody file a warning about it than a world whose only fault is a fussy customs service.

3.6.2.2 This comes out at two or three Amber zones per subsector, which is what a referee wants: few enough that one on the map means something, common enough that a subsector usually has some.

3.6.3 The chance is drawn from the world's own seed, so it is the same world every time the subsector is generated and does not move when the density changes.

Nothing is marked Red by generation.

3.6.4 Amber is a description of a profile, so it can be derived. Red is a referee's decision about their own campaign — it says something has gone wrong here that the players should not walk into — and nothing in a profile knows that. Generating Red would be the geology-costume problem of the planet spec 8.3.3 in a different hat.

3.6.5 The user can set any zone on any world, including Red. That is an edit under 5.3.

### 3.7 The stars

3.7.0 The star draw belongs to the system level and is specified in [SystemSpec.md](SystemSpec.md) section 2. The subsector reads it rather than owning it, under that document's 11.2, and what follows here describes what the subsector gets.

3.7.1 Each system draws a primary: a spectral class and a size, weighted so the subsector is mostly the dim, long-lived stars that are most of the sky, rather than an even spread across the classes.

3.7.2 A companion is drawn for roughly one system in three, and where there is one it gets its own class and size. No third star.

3.7.2.1 Two is where the detail stops paying. A binary changes how a system is described and how it is travelled; a trinary changes a column of text and nothing a referee will use.

3.7.3 The stars fill the Stars column of the sector line, the last of the three [src/io/export/sec.ts](src/io/export/sec.ts) leaves as the format's placeholder.

### 3.8 What generation does not do

3.8.1 The subsector does not set a world's orbit, or any other of its settings. It draws eighty worlds and opens none of them, and the star it shows in the Stars column is a label on a line rather than a thing a world has been placed in.

3.8.1.1 Placing a world in its system is the system level's, at [SystemSpec.md](SystemSpec.md) 5.2.2, and there it does reach the surface: an orbit written into a world's settings feeds climate, and climate feeds ice, life, and cover. That is deliberate and argued out at SystemSpec 6.6. What it needs from the subsector is nothing, which is why this clause is here rather than there.

3.8.2 Nothing generated in this document is read by the surface generator. The subsector reads the planet generator, never the reverse, and the dependency runs one way so that it cannot become a cycle later.

3.8.2.1 The profile is what this document must not touch, and does not: a world's UWP is `rollUwp` of its seed under 3.3.1, on the subsector and in the system alike. A profile is what the subsector commits to publicly, in the line it exports and the digits it draws. Settings are private to a world until something places it somewhere.

3.8.3 The other worlds of a system are the system level's, not the subsector's. A hex holds a system; what the subsector draws and what a sector line carries is that system's main world plus its counts of belts and gas giants, which is what a referee reads a subsector for. The rest is a level down, and [AppSpec.md](AppSpec.md) 1.3.2 puts it there.

### 3.9 The routes between worlds

3.9.1 Every published subsector map has lines on it between the hexes, and a subsector without them is a list of worlds rather than a region. Two kinds, as those maps have two kinds: the express network that carries word, and the trade that carries everything else.

3.9.1.1 How far apart two hexes are is a jump count, not a row and column difference. The columns are offset against each other, so a step sideways is also half a step up or down: rows are counted in halves, a sideways step pays for half a row of the vertical distance for free, and only what is left over costs a jump.

3.9.2 **X-boat routes.** A leg of the express network runs between two worlds with a class A or B starport, within two jumps. Those are the ports with a station that can turn an express boat round; anywhere else the boat is stranded.

3.9.2.1 Two jumps rather than the four an X-boat ship can make, because a subsector is eight hexes across and legs of four would be two lines from one side of it to the other. What is being drawn is the shape of the network in this region, not the range of the ship.

3.9.3 **Trade routes.** A trade route runs between two worlds within two jumps that want what each other has. Drawn lighter than an X-boat leg, because it is a run somebody makes when there is a cargo rather than a schedule that is kept whatever happens.

3.9.3.1 What counts as wanting: agricultural against non-agricultural, agricultural against industrial, industrial against non-industrial, high population against low, rich against poor, high technology against low. The classic pairs — food to the worlds that grow none, manufactures to the worlds that make none, and the run between somewhere rich and somewhere that is not.

3.9.3.2 Where an X-boat leg already runs, that is what is drawn. The express route is the stronger statement about the same pair of worlds, and two lines between two hexes say nothing the heavier one did not.

3.9.4 A Red zone is off both networks. An interdiction is exactly the thing a scheduled run is not flown through, and nobody is trading with it either.

3.9.5 Nothing about either is rolled. Two profiles and two hex numbers decide both, which means a route cannot disagree with the worlds at its ends, and a subsector regenerated from its seed has the same network on it.

3.9.6 This comes out at about four routes for every five inhabited worlds, most of them trade. That is a web a referee can follow from one end of a subsector to the other without the map turning into a thicket — and it is the right shape as well as the right size, since the express network is meant to be sparse and trade is meant to be everywhere.

### 3.10 The Mains

3.10.1 A Main is a run of worlds every one of which is within one jump of another on it. It is the oldest piece of Traveller astrography there is and the thing a region ends up named after — the Spinward Main — because a jump-1 ship can cross the whole of one, and a jump-1 ship is most of them.

3.10.1.1 Every world counts, whether anybody lives on it or not. A Main is a fact about where a ship can go, and an empty world with a gas giant to skim is as much a step along one as a hive world is.

3.10.1.2 A Main is a connected group and nothing cleverer: everything a jump-1 walk can reach from a world is on the same Main as it. So no world is on two, and no two Mains touch — if they did they would be one.

3.10.2 Three worlds is the shortest run worth the name. Two worlds a jump apart is a pair of neighbours, and calling it a Main would empty the word out.

3.10.3 A Main is named after the busiest world on it, which is the one anybody would say they were heading for.

3.10.4 Drawn as a wash behind the hexes it runs through, on a switch, since it is context rather than content. A wash rather than a line because a Main is a region and not a path: it has no direction and no two ends, and drawing it as a line would mean choosing an order it does not have.

3.10.4.1 Each Main gets its own colour so two that pass close by can be told apart, and the subsector says how many there are and how far the longest reaches.

3.10.5 What a Main looks like stops at the subsector's edge, and the real one does not. A subsector is eight hexes by ten and a Main can run the width of a sector; what is drawn here is the part of it in view. The sector level is where that is fixed.

### 3.11 Which way a region leans

3.11.1 A subsector carries two modifiers that every world in it is rolled with: one on population and one on tech level, each from minus three to plus three. A settled region and a frontier are the same rules with a different thumb on them, and that is a property of the region rather than of each world in it.

3.11.1.1 Three either way is already a lot — it moves the average world by half the scale. Past that the dice have stopped mattering and the referee is writing the digits themselves, which is what an override is for.

3.11.2 A modifier on the dice, not a number written over the answer. So a population lean carries into the government and the law that follow from it, which is how the rules work and what writing a figure over the top afterwards would miss: a region full of people is a region full of governments.

3.11.3 It changes what is on the worlds, not which hexes hold one. The density of 3.2 decides where the systems are and the lean decides what is on them, so a referee who has annotated half a subsector and then settles the region keeps every world they annotated, in the hex they annotated it in, with the same seed.

3.11.4 The two are separate thumbs. Leaning the tech of a region leaves its people where they were, because a low-technology region full of people and a high-technology empty one are both things a setting has in it.

3.11.5 A world handed down to the system level goes down with the profile the subsector drew, not with what its seed alone rolls. The subsector is what leaned it, so the subsector is what has to say so — [AppSpec.md](AppSpec.md) 1.3.1, a level above filling in what a level below could not have known.

## 4. Display

4.1 The subsector view is a panel of eighty hexes with the controls beside it, in the shape the planet view already uses: a left panel of settings, the map in the middle.

4.2 Each occupied hex carries what a Traveller subsector map carries, laid out where those maps lay it out: the hex number small at the top, the starport class above the world, the world in the middle, its name below, the bases as their own marks to the left, a gas giant to the right, and the lanes of 3.9 drawn between hexes underneath the lot. The four digits sit in every hex, occupied or not, because an empty hex still has to be referrable.

4.2.1 The published maps are black on white and say everything with position and shape. This one keeps the positions and adds colour, which is the one liberty it takes: colour says what kind of world it is without another line of text in a hex that has no room for one.

4.2.2 A world is a dot, coloured by what is on its surface and sized by how many people are on it. Water and air is blue, dry with air is tan, an airless rock is grey, and a world nobody lives on is drawn hollow. An asteroid belt is a scatter of rocks rather than a dot, the way the maps have always drawn one.

4.2.2.1 Sized by population rather than by the size digit, because population is what a referee is looking for when they scan a map. Physical size is a digit away in the profile and nobody navigates by it.

4.2.2.2 A world's own globe was tried here and taken out again. At the size a hex allows it is a dark disc — less legible than the dot it replaced, since a dot can be a colour chosen to be told apart and a photograph of a world cannot. It also cost a surface per hex, which arrived over about ten seconds of a map filling itself in. A picture of one world at a time belongs in 4.3.1, where there is room to look at it.

4.2.3 Colour that means something needs a key, so the map has one beside it: every colour, every mark, the two weights of lane, and what the size of a dot says. It folds away, because a key is read once and then known.

4.2.3.1 A key rather than a legend drawn into the map itself. The map is scaled to fit its panel and exported as a picture under 6.2, and a legend inside it would be scaled with it and would have to be placed somewhere no hex was.

4.3 Selecting a hex fills a panel with the system: the profile digit by digit as the planet spec 6.7 shows it, the trade classifications, the PBG figures, the stars, the bases, the zone, and the world's seed.

4.3.1 The panel also carries the world itself, turning, as the planet spec 4.4 draws it. This is the one world being looked at rather than one of eighty being glanced at, so it is worth a real surface.

4.3.1.1 Drawn where its own system puts it, so the world in the panel is the world the system view shows rather than a near miss: a surface is its climate and a climate is an orbit. Laying out one system to find that orbit is cheap. A belt has no globe: there is no sphere there to photograph.

4.3.1.2 The same orbit is what the panel's distance and its prose are written from, for the same reason. A subsector saying a world sits 5.77 AU out while its own system says 1.2 would be two answers about one world, and the profile alone cannot tell which — it does not know what star the world is under.

4.4 The panel is where a world is edited, and where it is opened as a planet under section 7.

4.5 The subsector's own settings — name, sector, letter, seed, density — sit above the map in the left panel, and the seed has the same reroll-and-regenerate behaviour the planet's does.

4.5 A subsector opened from a sector shows what is over its edge: the worlds within two hexes of it, lowlighted, and the routes that cross.

4.5.1 A map drawn without them says a subsector's edge is the edge of the universe, which is the one thing about a subsector that is never true — it is a square drawn on a sector, and the neighbours are right there.

4.5.2 Two hexes is exactly as far as a route reaches under 3.9, so every route crossing the edge has its far end in view. Half a line pointing off the page says less than no line at all.

4.5.3 Lowlighted and unclickable. They are there to say the subsector has edges rather than ends; a referee who wants one of them opens that subsector, and the way to do that is one level up.

4.5.4 The grid is drawn across the whole border, not only where a world sits, so the edge reads as a subsector continuing rather than as dots floating beside one.

4.5.5 A subsector opened on its own has no neighbours to know about, and is framed on itself. Nothing is missing: there is no sector to ask.

4.6 Colour is the map's convention rather than the planet's: the subsector is a document, not a picture of a place. It reads in both light and dark.

## 5. Subsector data and persistence

5.1 A save contains the following.

| Field | Notes |
| --- | --- |
| Subsector name | Free text. |
| Sector | The sector it belongs to, see 2.2.1. Free text. |
| Letter | A to P, see 2.2.3. |
| Seed | Required. Without it the subsector cannot be rebuilt. |
| Density | One of the four of 3.2.2. |
| Leaning | The population and tech modifiers of 3.11, where the referee has set them. |
| Overrides | Per hex, only where the user has changed something, see 5.3. |

5.2 A save holds no generated world. Load rebuilds all eighty hexes from the seed and the density, exactly as the planet spec 6.3 rebuilds a surface.

5.3 An override is what the user typed over what was rolled, keyed by hex, and it holds only the fields that were changed: name, UWP, bases, zone, PBG, stars, notes, and whether the hex holds a system at all under 3.2.3.

5.3.1 Only what changed, so a subsector the user has read and not edited saves as its seed and nothing else, and so a later change to the generator improves the worlds nobody has touched while leaving the ones they have alone.

5.3.2 A note is free prose about a system, which is what the planet spec 6.5.2 gives a hex and 6.10 gives a world. A referee writing up a region writes most of it on the subsector, not inside each world.

5.3.3 An override never changes a world's seed. The seed is the world, the override is what the referee says about it, and a user who edits a UWP and then opens the world gets the terrain the seed makes with the profile they typed — which is the same arrangement the planet spec 6.7 already has for a hand-edited profile.

5.3.4 An override on a hex that the current density leaves empty is kept, and the hex is drawn as occupied with a mark saying it is there because the user put it there. Dropping it would lose written work to a slider, which is the thing the planet spec 6.4.4 exists to prevent.

5.3.5 A hex also stores the seed of the system in it, where the referee has rolled a different one. A hex's system seed is derived from the subsector's under 3.1.3 and that is what the hex holds until somebody deliberately replaces it; storing the replacement is what keeps the subsector and the system view agreeing about what is in the hex.

5.3.5.1 This is not 5.3.3 being broken. That clause is about a profile: typing over a world's UWP does not reach back and change which world it is. Rolling the system in a hex is the referee asking for a different system, said out loud, and the document has to remember that they asked.

5.3.5.2 Rolling from inside the system view rolls the hex rather than wandering off. A system reached down from a subsector belongs to that subsector, and a Roll that produced a system the subsector above had never heard of would be the level below quietly leaving the document it came from.

5.4 The document carries a version number and is validated on load, as the planet spec 6.4.2 and 6.4.3 require of a planet.

5.5 A subsector save is a folder holding its JSON, the map as a PNG, and whatever exports of section 6 were asked for, on the same File System Access route as the planet spec 6.4.1. A browser without that route gets the folder as an archive, as a planet save does.

5.5.1 The sector file of 6.1 is written every time rather than being asked for. It is one line per world and costs nothing, and a subsector that cannot be handed to a map is a subsector only this application can read.

5.5.2 The fields of 5.3 are edited in the hex panel, under whatever the hex says it is: the referee reads the world and then writes over it. Each field shows what the subsector is showing, whether that came from the generator or from them — a box that held only their own edits would be empty on every hex they had not touched, and they would be typing a name in from scratch to change a letter of it. What decides whether anything is stored is whether it still matches what was rolled, so typing a name back to what it already was leaves nothing behind.

5.6 Unsaved edits are tracked and warned about, as the planet spec 6.4.4 does. An edit is any change to a stored field of 5.1, the seed and density included.

5.7 A subsector save holds the systems the referee has worked up, and the worlds worked up inside those, carried in the document itself under the app spec 4.1.2. Only those: a hex nobody has opened is its seed, and eighty folders describing what the seed already describes is eighty folders of nothing.

5.7.1 Eighty planet files, each with its images, is a directory of tens of megabytes describing worlds nobody has looked at. A seed is twelve bytes and produces the same thing. What makes a system or a world worth a file is that somebody went into it and changed something.

5.7.2 Going down a level and coming back up does not lose the level below. A system opened from a hex is held against that hex while the subsector is open, and a world opened from that system against that system, so a referee who names a world, goes up to look at the subsector and comes back down finds the name they gave it. Without that, the level below undoes itself every time anybody looks at the level above.

5.7.2.1 Held by seed rather than by name or designation, since both of those move: rename a system and every world in it is designated something else, and a world put down under the old name would be looked for under the new one and not found. The seed is the world, which is 5.3.3 again.

5.7.2.2 Held while the application is open; written when the referee saves. Moving between levels is not saving, and nothing is written to disk until Save is pressed — but nothing is lost on the way between them either, and nothing asks about it. The app spec 4.10 has one Save for the chain, at the level that owns the document.

## 6. Exporting the subsector

6.1 The whole subsector as a sector file: the header row of [src/io/export/sec.ts](src/io/export/sec.ts) followed by one line per system, in hex order. This is the export the feature exists to make possible, and it is what TravellerMap and everything like it reads.

6.1.1 The Bases, Zone, and Stars columns are now filled, from 3.5, 3.6, and 3.7. The `sectorLine` function keeps its shape and gains the three values as arguments rather than assuming them blank, so a single world exported from the planet view is unchanged.

6.1.2 Allegiance stays Na for a generated world and is an override field like any other. An unclaimed world is what a subsector with no polities on it holds.

6.2 The subsector as a picture, framed on the whole subsector rather than on wherever the user has scrolled. The planet spec 6.4.5.1 gives the reason.

6.2.1 As SVG and as PNG. The SVG is the drawing itself and scales to a wall; the PNG is what can be pasted into anything, and is drawn at twice the size because a hex number at eleven pixels does not survive being printed.

6.2.2 It carries its own styling. A file that had to be paired with the application's stylesheet is a file nobody can open, so the exported map repeats the colours rather than borrowing them.

6.2.2.1 That is a duplication and it is the cheap half of one. The arithmetic is shared — both maps ask the same module where a hex goes — because a hex in the wrong place would be a different map, while a hex in the wrong blue is the same map in the wrong blue.

6.2.3 It is titled, with the sector, the count, the density and the seed. A file leaves the application and has to say what it is when it turns up in a downloads folder six months later.

6.2.4 The Mains follow the switch of 3.10.4. What is exported is the subsector as the referee has it set up, not a second set of choices to make at the moment of saving.

6.3 The subsector as a CSV, one row per system with every derived figure in its own column, for a referee who wants it in a spreadsheet. The sector file packs seven digits into one field because a map reads it; a spreadsheet wants to sort on the population.

6.4 A subsector sheet: the systems as a readable document, the way the planet spec 6.19 writes one world up, in Markdown and in HTML. The Markdown goes into a wiki or a repository; the HTML carries its own styling, for printing and for handing to a player.

6.4.1 It leads with the Mains and the X-boat network, because those are the two things about a region that are not visible one world at a time.

6.4.2 Whatever the referee wrote about a hex under 5.3.2 travels with it. A sheet that left the notes behind would be a sheet of the generated subsector rather than of theirs.

6.5 The save asks which of these to write, beside the subsector's own document. The sector file and the PNG are on by default, since between them they cover handing the subsector to a map and handing it to a person.

## 7. Where a hex becomes a planet

7.1 Opening a hex from the subsector opens its system, under the system level of [AppSpec.md](AppSpec.md) 1.1, and the main world is opened from there as a planet under the planet spec, with its derived seed, its profile, its name, and its sector and hex already filled in.

7.1.1 Two steps rather than one, because a hex holds a system and a system holds more than the world the subsector draws. Where a user only ever wants the main world, the subsector offers it directly as well: the system is the level, not a toll gate.

7.2 The two views are one application. Opening a world from the subsector is a navigation, and going back returns to the subsector with the same selection.

7.3 The planet's sector and hex fields, which the planet spec 6.14 has as free text the user types, arrive filled in from 2.2. They stay editable. A world carried out of its subsector into another one is a thing referees do.

7.4 An edit made in the planet view to the sector, hex, name, or UWP does not write back to the subsector. The subsector's overrides are the subsector's, under 5.3, and a silent write back from a view the user opened to look at terrain would change a document they did not think they were editing.

7.4.1 Where the two disagree, the planet view says so and offers to take the subsector's values or to send its own back as an override. Offering is not writing.

7.5 The unsaved-edit tracking of 5.6 and of the planet spec 6.4.4 are separate. Two documents, two dirty flags, and a prompt that names which one is at risk.

## 8. Build order

8.1 The order below is chosen so that each step is worth having on its own, and so that the riskiest claim — 1.3, that a world is the same world either way — is tested first rather than last.

8.2 **Generation core.** The seed chain of 3.1, presence of 3.2, and the world of 3.3, with no UI at all. A function from a subsector record to eighty systems, and a test that a generated world's seed run through `rollUwp` gives the profile the subsector shows. Naming, 3.4, comes with it, which means the move out of `settle.ts` happens here.

8.3 **The rest of the system.** Bases, zone, and stars, 3.5 to 3.7, and the widened `sectorLine` of 6.1.1. At the end of this step a whole subsector can be exported as a sector file from the command line or a test, and pasted into TravellerMap to be looked at. That is the first point at which the feature is useful to somebody, and it is reached before any pixels are drawn.

8.4 **The subsector.** The panel of section 4, selection, and the system panel. Read only.

8.5 **Overrides and persistence.** Section 5. Editing, saving, loading, and the dirty tracking.

8.6 **Navigation.** Section 7, the route into the planet view and back.

8.7 **The remaining exports.** 6.2 to 6.5. Done.

8.8 Steps 8.2 and 8.3 are where the design can still be wrong cheaply. Everything after them is work rather than risk.

## 9. Open questions

9.1 **A whole sector.** Settled as a level of its own by [AppSpec.md](AppSpec.md) 1.1, with a seed that fixes its sixteen subsector seeds. What remains open is the shape below.

9.1.1 Sixteen subsectors is a sector, and the arithmetic is the same arithmetic. Whether that is a container above this one or just this one generated sixteen times with the letter varying is worth answering before section 5's save format is settled, because the answer decides whether a subsector file needs to be nestable. Leaning towards the second: a sector is a folder of sixteen files and a name, and nothing about the subsector changes.

9.2 **Trade and communication routes.** Closed: section 3.9. The worry was that a route is a path rather than a per-hex value, which is what set rivers aside in the planet spec 8.3.2. It turned out not to apply — a lane is a pair of hexes and nothing longer, so there is no path to trace and nothing to keep consistent along one. What a path would still be needed for is a route that runs across a subsector boundary, which waits on the sector level.

9.3 **Polities.** Allegiance is a column with `Na` in it, and a subsector with two or three small states in it is a more interesting document than one with none. Generating them needs a notion of neighbours and borders that nothing here has, and hand-drawn borders need a drawing tool. Open.

9.4 **Placing the subsector in a real setting.** The planet spec 8.5 leaves sector names unchecked on purpose, and the same applies here. Nothing validates that subsector G of a named sector is where the user thinks it is, and nothing should.

9.5 **Stellar detail beyond 3.7.** No longer open here. Orbits, habitable zones, and the rest of a system's worlds belong to the system level, which [AppSpec.md](AppSpec.md) 8.5 has still to write up. What the subsector draws of a system stays 3.3 to 3.7, and 3.8.1.1 still rules out letting any of it reach the surface generator.
