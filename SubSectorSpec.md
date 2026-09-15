# PlanetHex Subsectors

A subsector of star systems generated from one seed, drawn as the standard eighty hex chart, where every world is a PlanetHex planet waiting to be opened.

This document is the companion to [PlanetSpec.md](PlanetSpec.md) and is numbered the same way, so the code can cite either. Where a clause here says *the planet spec*, it means that document.

## Contents

1. [Purpose](#1-purpose)
2. [The chart](#2-the-chart)
3. [Generating a system](#3-generating-a-system)
4. [Display](#4-display)
5. [Subsector data and persistence](#5-subsector-data-and-persistence)
6. [Exporting the subsector](#6-exporting-the-subsector)
7. [Where a hex becomes a planet](#7-where-a-hex-becomes-a-planet)
8. [Build order](#8-build-order)
9. [Open questions](#9-open-questions)

---

## 1. Purpose

1.1 The application generates a subsector of star systems from a seed and displays it as the eighty hex chart Traveller draws a subsector on. Each hex either holds a system or is empty space.

1.2 A subsector is a seed, a name, a handful of settings, and whatever the user has typed over the top of what was rolled. Nothing generated is stored, so a subsector travels as a short piece of JSON exactly as a planet does under the planet spec 1.3.

1.3 Every world on the chart is a planet of the planet spec. Its seed is derived from the subsector's, so clicking a hex opens a world with terrain, a globe, and a local panel, and its profile is the profile that seed produces whether it was reached through the chart or opened on its own.

1.3.1 This is the whole point of the feature, and it constrains section 3 more than anything else here. The subsector does not invent worlds. It decides *where* worlds are and then names the seeds that generate them, and the profile it shows for a world is the profile the planet spec 6.7.2 would roll for that seed, digit for digit. A subsector that rolled its own UWPs would be a second world generator wearing the first one's chart, and the two would disagree the moment a user opened a hex.

1.4 What the chart adds beyond the planet spec is the rest of the system: the star or stars, the belts and the gas giants, the bases, and the travel zone. None of it reaches the surface generator, for the reason in 3.8.2. Where the system level takes over from the chart, see 3.8.3.

1.5 The application uses Traveller's terms and formats where they are the clearest way to describe what it does, as the planet spec 1.1.1 has it. No sector, subsector, world, or name from any published setting is reproduced.

## 2. The chart

### 2.1 Shape

2.1.1 A subsector is 8 columns across and 10 rows down, eighty hexes. That is a quarter of a sector chart across and a quarter down, which is what makes sixteen of them a sector, and it is already in the code: `SUB_COLS` and `SUB_ROWS` in [src/location.ts](src/location.ts).

2.1.2 The hexes are drawn in the Traveller convention: flat columns of pointy-topped hexes, column 01 on the left, odd columns sitting half a hex higher than even ones, row 01 at the top. This is the opposite convention from the surface hexes of the planet spec section 2, and deliberately not shared with them.

2.1.3 A chart hex is one star system. A surface hex is a piece of ground on one planet. The planet spec 6.14.3 already says these two grids have nothing to do with each other, and no code should be shared between them beyond the four digit parsing of 2.2.

### 2.2 Where a subsector sits

2.2.1 A subsector carries the sector it belongs to, free text as the planet spec 6.14 has it, and its letter, A to P. Those two are what a world's four digit hex is read against.

2.2.2 Hexes are held and shown sector-absolute, 0101 to 3240, not numbered 0101 to 0810 within the subsector. `parseSectorHex` and `subsectorLetter` in [src/location.ts](src/location.ts) stay the single authority on what a hex means, and a world exported from subsector G lands on the sector map where subsector G is rather than on top of subsector A.

2.2.2.1 The alternative, local numbering with an offset applied at export, was rejected because the offset would then exist in two places: in the export and in whatever the user reads off the screen. A referee who writes down 1914 wants to find 1914 later.

2.2.3 The letter is chosen rather than derived, because here it is the thing known first and the hex range follows from it. This is the reverse of the planet spec 6.14.2, where a hex is known and the letter falls out of it, and the two are consistent: in both cases only one of the pair is typed.

2.2.4 A subsector with no letter chosen is treated as A, so a user who wants eighty worlds and does not care where they are gets them without answering a question first.

## 3. Generating a system

### 3.1 The seed chain

3.1.1 The subsector has a seed, in the form and alphabet of `randomSeed` in [src/planet.ts](src/planet.ts). Everything on the chart descends from it.

3.1.2 Each hex draws its values from the streams of `valueFor` in [src/gen/rng.ts](src/gen/rng.ts), keyed on the subsector seed, the hex, and a named stream: presence, name, stars, bases, and so on. Per-hex and per-stream rather than a sequence, for the reason `valueFor` exists at all — nothing may depend on the order the eighty hexes are visited in.

3.1.3 A world's own seed is eight characters of the seed alphabet, derived by hashing the subsector seed with the hex. It is then handed to the planet generator untouched, and that is what 1.3.1 requires.

3.1.3.1 The derived seed is written into the world record and shown in the UI, so a user can copy it, open it alone, and get the same world. A seed that could not be read off the screen would make the claim of 1.3 untestable by the person who most wants to test it.

### 3.2 Whether a hex holds a system

3.2.1 Each hex draws one value in [0, 1) from its presence stream. A hex holds a system where that value is under the density threshold.

3.2.2 Density is a subsector setting with four choices: **Rift** at one hex in six, **Sparse** at one in three, **Standard** at one in two, and **Dense** at two in three. Standard is the default, and it is the 4+ on one die that Traveller's own charts are built to.

3.2.2.1 A threshold against a fixed per-hex value rather than a die roll per density, so that raising the density only ever adds systems and never moves the ones already there. A referee who has written notes on half a chart and then decides the region should be busier keeps the half they wrote.

3.2.2.2 Lowering the density removes systems, and it removes the ones nearest the threshold. Where a removed system carries user edits under 5.3, it is kept and marked rather than dropped, and 5.3.4 says so.

3.2.3 The user can place a system in an empty hex and remove one from a full hex. Both are edits under 5.3, and neither changes the seed: a chart is a starting point, and a referee who wants a world at 1914 should not have to reroll the other seventy-nine to get it.

### 3.3 The world

3.3.1 The main world's profile is `rollUwp(worldSeed)` from [src/planet.ts](src/planet.ts), unmodified. See 1.3.1.

3.3.1.1 This means the chart carries no world-generation rules of its own, and a change to the planet generator changes the chart with it. That is the intended coupling, not an accident of reuse.

3.3.2 The trade classifications are `tradeCodes` from [src/gen/trade.ts](src/gen/trade.ts), as the planet spec 6.16 already derives them.

3.3.3 The population multiplier, belts, and gas giants are `pbgFor` from the same file, on the world's own seed. The planet spec 6.16.2 calls these the one thing PlanetHex has nothing behind, and that is still true; what changes here is that they now sit beside seventy-nine others, so the same figures are being read as a region rather than as one line.

### 3.4 The name

3.4.1 A world is named from the machinery of the planet spec 6.24.6, which already generates names in five flavours and is already seeded. It moves out of [src/gen/settle.ts](src/gen/settle.ts) into a naming module both can call, since a world name and a city name are the same problem.

3.4.2 The subsector draws a dominant flavour, and each world follows it three times in four. The remaining quarter draws its own.

3.4.2.1 A region reads as a region when most of its names sound related, which is what a frontier settled from one direction actually looks like. All eighty from one flavour reads as a list generated by a program; all eighty independent reads as no history at all. Three in four is the mixture that sounds like somewhere.

3.4.3 Names are generated for the whole chart at once so collisions can be dealt with, as 6.24.6 does for a world's settlements. Two worlds in one subsector with one name between them is worse than a name drawn twice.

### 3.5 Bases

3.5.1 Naval and scout bases are rolled against the starport class, by the SRD's own table: a naval base is possible only at class A and B, a scout base at A through D, neither anywhere else.

3.5.2 Bases are derived rather than invented, which is why they are here and the zone of 3.6 is more cautious. The profile already says what quality of port the world has, and the rules already say what a port of that quality can support.

3.5.3 The base codes go in the Bases column of the sector line, which [src/io/export/sec.ts](src/io/export/sec.ts) currently leaves blank.

### 3.6 The travel zone

3.6.1 Three things put a world in the running for an Amber zone. Its atmosphere is 10 or above — exotic, corrosive or insidious, so a landing party needs a suit and the suit may not last. Its government is 0, 7 or 10 — nobody to deal with, a dozen rival states none of whose permits the others honour, or one person whose mood is the law. Or its law level is 0 or 9 and above — no law at all, or so much of it that a crew will fall foul of something they did not know was a crime.

3.6.1.1 A world nobody lives on qualifies on its air alone. It has no government and no law rather than a dangerous amount of either: those digits are blank, not extreme, and flagging an empty rock for anarchy is warning travellers about nobody. Its atmosphere is still its atmosphere, and that is a hazard whoever is or is not there.

3.6.2 Being in the running is not being flagged. Half a subsector qualifies on paper — twenty of its forty worlds — and a chart where half the hexes carry a warning is a chart where the warning means nothing. So a trigger buys a chance, and the chance is small: about one in fourteen for a world with one thing wrong with it, one in five with two, and two in five with all three.

3.6.2.1 Weighted by how many triggers a world has, rather than flat, because a corrosive world with no law and no government is genuinely more likely to have had somebody file a warning about it than a world whose only fault is a fussy customs service.

3.6.2.2 This comes out at two or three Amber zones per subsector, which is what a referee wants: few enough that one on the chart means something, common enough that a subsector usually has some.

3.6.3 The chance is drawn from the world's own seed, so it is the same world every time the chart is generated and does not move when the density changes.

Nothing is marked Red by generation.

3.6.4 Amber is a description of a profile, so it can be derived. Red is a referee's decision about their own campaign — it says something has gone wrong here that the players should not walk into — and nothing in a profile knows that. Generating Red would be the geology-costume problem of the planet spec 8.3.3 in a different hat.

3.6.5 The user can set any zone on any world, including Red. That is an edit under 5.3.

### 3.7 The stars

3.7.0 The star draw belongs to the system level and is specified in [SystemSpec.md](SystemSpec.md) section 2. The chart reads it rather than owning it, under that document's 11.2, and what follows here describes what the chart gets.

3.7.1 Each system draws a primary: a spectral class and a size, weighted so the chart is mostly the dim, long-lived stars that are most of the sky, rather than an even spread across the classes.

3.7.2 A companion is drawn for roughly one system in three, and where there is one it gets its own class and size. No third star.

3.7.2.1 Two is where the detail stops paying. A binary changes how a system is described and how it is travelled; a trinary changes a column of text and nothing a referee will use.

3.7.3 The stars fill the Stars column of the sector line, the last of the three [src/io/export/sec.ts](src/io/export/sec.ts) leaves as the format's placeholder.

### 3.8 What generation does not do

3.8.1 The chart does not set a world's orbit, or any other of its settings. It draws eighty worlds and opens none of them, and the star it shows in the Stars column is a label on a line rather than a thing a world has been placed in.

3.8.1.1 Placing a world in its system is the system level's, at [SystemSpec.md](SystemSpec.md) 5.2.2, and there it does reach the surface: an orbit written into a world's settings feeds climate, and climate feeds ice, life, and cover. That is deliberate and argued out at SystemSpec 6.6. What it needs from the chart is nothing, which is why this clause is here rather than there.

3.8.2 Nothing generated in this document is read by the surface generator. The chart reads the planet generator, never the reverse, and the dependency runs one way so that it cannot become a cycle later.

3.8.2.1 The profile is what this document must not touch, and does not: a world's UWP is `rollUwp` of its seed under 3.3.1, on the chart and in the system alike. A profile is what the chart commits to publicly, in the line it exports and the digits it draws. Settings are private to a world until something places it somewhere.

3.8.3 The other worlds of a system are the system level's, not the chart's. A hex holds a system; what the chart draws and what a sector line carries is that system's main world plus its counts of belts and gas giants, which is what a referee reads a chart for. The rest is a level down, and [AppSpec.md](AppSpec.md) 1.3.2 puts it there.

### 3.9 The lanes between worlds

3.9.1 Every published subsector map has lines on it between the hexes, and a chart without them is a list of worlds rather than a region. A lane says which worlds are in reach of each other, which is the question a referee is actually asking when they look at a chart.

3.9.1.1 How far apart two hexes are is a jump count, not a row and column difference. The columns are offset against each other, so a step sideways is also half a step up or down: rows are counted in halves, a sideways step pays for half a row of the vertical distance for free, and only what is left over costs a jump.

3.9.2 A lane runs between two inhabited worlds when they are within the reach of the poorer of the two ports. A port that can refine fuel and refit a ship — class A or B — reaches two hexes; C, D and E reach one; X reaches nothing and is on no schedule.

3.9.2.1 The numbers are small on purpose. A lane between every pair of worlds that could reach each other is a chart with a hundred lines on it, which is a chart that says nothing. Roughly one lane per world leaves a web that can be followed from one end of a subsector to the other.

3.9.2.2 A Red zone carries no lanes. An interdiction is exactly the thing a scheduled run is not flown through, so the world drops off the web entirely rather than being drawn and warned about twice.

3.9.3 A lane is main where both ends have a class A or B port, and a feeder otherwise. The difference is drawn, because it is the difference between a route somebody keeps to a timetable and a route somebody flies when there is a reason to.

3.9.4 Nothing about a lane is rolled. Two profiles and two hex numbers decide it, which means a lane cannot disagree with the worlds at its ends, and a chart regenerated from its seed has the same web on it.


## 4. Display

4.1 The chart is a panel of eighty hexes with the controls beside it, in the shape the planet view already uses: a left panel of settings, the chart in the middle.

4.2 Each occupied hex carries what a Traveller subsector map carries, laid out where those maps lay it out: the hex number small at the top, the starport class above the world, the world in the middle, its name below, the bases as their own marks to the left, a gas giant to the right, and the lanes of 3.9 drawn between hexes underneath the lot. The four digits sit in every hex, occupied or not, because an empty hex still has to be referrable.

4.2.1 The published maps are black on white and say everything with position and shape. This one keeps the positions and adds colour, which is the one liberty it takes: colour says what kind of world it is without another line of text in a hex that has no room for one.

4.2.2 A world is a dot, coloured by what is on its surface and sized by how many people are on it. Water and air is blue, dry with air is tan, an airless rock is grey, and a world nobody lives on is drawn hollow. An asteroid belt is a scatter of rocks rather than a dot, the way the maps have always drawn one.

4.2.2.1 Sized by population rather than by the size digit, because population is what a referee is looking for when they scan a chart. Physical size is a digit away in the profile and nobody navigates by it.

4.2.2.2 A world's own globe was tried here and taken out again. At the size a hex allows it is a dark disc — less legible than the dot it replaced, since a dot can be a colour chosen to be told apart and a photograph of a world cannot. It also cost a surface per hex, which arrived over about ten seconds of a chart filling itself in. A picture of one world at a time belongs in 4.3.1, where there is room to look at it.

4.2.3 Colour that means something needs a key, so the chart has one beside it: every colour, every mark, the two weights of lane, and what the size of a dot says. It folds away, because a key is read once and then known.

4.2.3.1 A key rather than a legend drawn into the chart itself. The chart is scaled to fit its panel and exported as a picture under 6.2, and a legend inside it would be scaled with it and would have to be placed somewhere no hex was.

4.3 Selecting a hex fills a panel with the system: the profile digit by digit as the planet spec 6.7 shows it, the trade classifications, the PBG figures, the stars, the bases, the zone, and the world's seed.

4.3.1 The panel also carries the world itself, turning, as the planet spec 4.4 draws it. This is the one world being looked at rather than one of eighty being glanced at, so it is worth a real surface.

4.3.1.1 Drawn where its own system puts it, so the world in the panel is the world the system view shows rather than a near miss: a surface is its climate and a climate is an orbit. Laying out one system to find that orbit is cheap. A belt has no globe: there is no sphere there to photograph.

4.3.1.2 The same orbit is what the panel's distance and its prose are written from, for the same reason. A chart saying a world sits 5.77 AU out while its own system says 1.2 would be two answers about one world, and the profile alone cannot tell which — it does not know what star the world is under.

4.4 The panel is where a world is edited, and where it is opened as a planet under section 7.

4.5 The subsector's own settings — name, sector, letter, seed, density — sit above the chart in the left panel, and the seed has the same reroll-and-regenerate behaviour the planet's does.

4.6 Colour is the map's convention rather than the planet's: the chart is a document, not a picture of a place. It reads in both light and dark.

## 5. Subsector data and persistence

5.1 A save contains the following.

| Field | Notes |
| --- | --- |
| Subsector name | Free text. |
| Sector | The sector it belongs to, see 2.2.1. Free text. |
| Letter | A to P, see 2.2.3. |
| Seed | Required. Without it the chart cannot be rebuilt. |
| Density | One of the four of 3.2.2. |
| Overrides | Per hex, only where the user has changed something, see 5.3. |

5.2 A save holds no generated world. Load rebuilds all eighty hexes from the seed and the density, exactly as the planet spec 6.3 rebuilds a surface.

5.3 An override is what the user typed over what was rolled, keyed by hex, and it holds only the fields that were changed: name, UWP, bases, zone, PBG, stars, notes, and whether the hex holds a system at all under 3.2.3.

5.3.1 Only what changed, so a chart the user has read and not edited saves as its seed and nothing else, and so a later change to the generator improves the worlds nobody has touched while leaving the ones they have alone.

5.3.2 A note is free prose about a system, which is what the planet spec 6.5.2 gives a hex and 6.10 gives a world. A referee writing up a region writes most of it on the chart, not inside each world.

5.3.3 An override never changes a world's seed. The seed is the world, the override is what the referee says about it, and a user who edits a UWP and then opens the world gets the terrain the seed makes with the profile they typed — which is the same arrangement the planet spec 6.7 already has for a hand-edited profile.

5.3.4 An override on a hex that the current density leaves empty is kept, and the hex is drawn as occupied with a mark saying it is there because the user put it there. Dropping it would lose written work to a slider, which is the thing the planet spec 6.4.4 exists to prevent.

5.4 The document carries a version number and is validated on load, as the planet spec 6.4.2 and 6.4.3 require of a planet.

5.5 A subsector save is a folder holding its JSON, the chart as a PNG, and whatever exports of section 6 were asked for, on the same File System Access route as the planet spec 6.4.1.

5.6 Unsaved edits are tracked and warned about, as the planet spec 6.4.4 does. An edit is any change to a stored field of 5.1, the seed and density included.

5.7 A planet save and a subsector save are separate documents. A subsector does not contain its worlds' planet files, and opening a world under section 7 does not write one.

5.7.1 Eighty planet files, each with its images, is a directory of tens of megabytes describing worlds nobody has looked at. A seed is twelve bytes and produces the same thing. Where a referee has worked a world up and wants it kept, they save that planet themselves, the way they would have if they had generated it alone.

## 6. Exporting the subsector

6.1 The whole chart as a sector file: the header row of [src/io/export/sec.ts](src/io/export/sec.ts) followed by one line per system, in hex order. This is the export the feature exists to make possible, and it is what TravellerMap and everything like it reads.

6.1.1 The Bases, Zone, and Stars columns are now filled, from 3.5, 3.6, and 3.7. The `sectorLine` function keeps its shape and gains the three values as arguments rather than assuming them blank, so a single world exported from the planet view is unchanged.

6.1.2 Allegiance stays Na for a generated world and is an override field like any other. An unclaimed world is what a chart with no polities on it holds.

6.2 The chart as a PNG, drawn by the same renderer that draws the panel, framed on the whole subsector rather than on wherever the user has scrolled. The planet spec 6.4.5.1 gives the reason.

6.3 The chart as a CSV, one row per system with every derived figure in its own column, for a referee who wants it in a spreadsheet.

6.4 A subsector sheet: the eighty systems as a readable document, the way the planet spec 6.19 writes one world up.

6.5 The dialogue of the planet spec 6.23, which asks what a save should write, gains the choices above when a subsector is what is open.

## 7. Where a hex becomes a planet

7.1 Opening a hex from the chart opens its system, under the system level of [AppSpec.md](AppSpec.md) 1.1, and the main world is opened from there as a planet under the planet spec, with its derived seed, its profile, its name, and its sector and hex already filled in.

7.1.1 Two steps rather than one, because a hex holds a system and a system holds more than the world the chart draws. Where a user only ever wants the main world, the chart offers it directly as well: the system is the level, not a toll gate.

7.2 The two views are one application. Opening a world from the chart is a navigation, and going back returns to the chart with the same selection.

7.3 The planet's sector and hex fields, which the planet spec 6.14 has as free text the user types, arrive filled in from 2.2. They stay editable. A world carried out of its chart into another one is a thing referees do.

7.4 An edit made in the planet view to the sector, hex, name, or UWP does not write back to the chart. The chart's overrides are the chart's, under 5.3, and a silent write back from a view the user opened to look at terrain would change a document they did not think they were editing.

7.4.1 Where the two disagree, the planet view says so and offers to take the chart's values or to send its own back as an override. Offering is not writing.

7.5 The unsaved-edit tracking of 5.6 and of the planet spec 6.4.4 are separate. Two documents, two dirty flags, and a prompt that names which one is at risk.

## 8. Build order

8.1 The order below is chosen so that each step is worth having on its own, and so that the riskiest claim — 1.3, that a world is the same world either way — is tested first rather than last.

8.2 **Generation core.** The seed chain of 3.1, presence of 3.2, and the world of 3.3, with no UI at all. A function from a subsector record to eighty systems, and a test that a generated world's seed run through `rollUwp` gives the profile the chart shows. Naming, 3.4, comes with it, which means the move out of `settle.ts` happens here.

8.3 **The rest of the system.** Bases, zone, and stars, 3.5 to 3.7, and the widened `sectorLine` of 6.1.1. At the end of this step a whole subsector can be exported as a sector file from the command line or a test, and pasted into TravellerMap to be looked at. That is the first point at which the feature is useful to somebody, and it is reached before any pixels are drawn.

8.4 **The chart.** The panel of section 4, selection, and the system panel. Read only.

8.5 **Overrides and persistence.** Section 5. Editing, saving, loading, and the dirty tracking.

8.6 **Navigation.** Section 7, the route into the planet view and back.

8.7 **The remaining exports.** 6.2 to 6.5.

8.8 Steps 8.2 and 8.3 are where the design can still be wrong cheaply. Everything after them is work rather than risk.

## 9. Open questions

9.1 **A whole sector.** Settled as a level of its own by [AppSpec.md](AppSpec.md) 1.1, with a seed that fixes its sixteen subsector seeds. What remains open is the shape below.

9.1.1 Sixteen subsectors is a sector, and the arithmetic is the same arithmetic. Whether that is a container above this one or just this one generated sixteen times with the letter varying is worth answering before section 5's save format is settled, because the answer decides whether a subsector file needs to be nestable. Leaning towards the second: a sector is a folder of sixteen files and a name, and nothing about the chart changes.

9.2 **Trade and communication routes.** Closed: section 3.9. The worry was that a route is a path rather than a per-hex value, which is what set rivers aside in the planet spec 8.3.2. It turned out not to apply — a lane is a pair of hexes and nothing longer, so there is no path to trace and nothing to keep consistent along one. What a path would still be needed for is a route that runs across a subsector boundary, which waits on the sector level.

9.3 **Polities.** Allegiance is a column with `Na` in it, and a subsector with two or three small states in it is a more interesting document than one with none. Generating them needs a notion of neighbours and borders that nothing here has, and hand-drawn borders need a drawing tool. Open.

9.4 **Placing the subsector in a real setting.** The planet spec 8.5 leaves sector names unchecked on purpose, and the same applies here. Nothing validates that subsector G of a named sector is where the user thinks it is, and nothing should.

9.5 **Stellar detail beyond 3.7.** No longer open here. Orbits, habitable zones, and the rest of a system's worlds belong to the system level, which [AppSpec.md](AppSpec.md) 8.5 has still to write up. What the chart draws of a system stays 3.3 to 3.7, and 3.8.1.1 still rules out letting any of it reach the surface generator.
