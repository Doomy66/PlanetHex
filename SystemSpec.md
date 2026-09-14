# PlanetHex Systems

One star or several, the orbits around them, and the worlds in those orbits — the level between a hex on a chart and a planet with a surface.

This document sits under [SubSectorSpec.md](SubSectorSpec.md) and over [PlanetSpec.md](PlanetSpec.md), and [AppSpec.md](AppSpec.md) 1.1 places it among the four levels. It is numbered the same way, so the code can cite it. *The planet spec*, *the subsector spec*, and *the app spec* mean those three documents.

## Contents

1. [Purpose](#1-purpose)
2. [The star or stars](#2-the-star-or-stars)
3. [Orbits](#3-orbits)
4. [What fills an orbit](#4-what-fills-an-orbit)
5. [The main world](#5-the-main-world)
6. [The other worlds](#6-the-other-worlds)
7. [Names](#7-names)
8. [Display](#8-display)
9. [System data and persistence](#9-system-data-and-persistence)
10. [Exporting the system](#10-exporting-the-system)
11. [What the chart reads](#11-what-the-chart-reads)
12. [Build order](#12-build-order)
13. [Open questions](#13-open-questions)

---

## 1. Purpose

1.1 A system is what one hex of a subsector chart holds: a primary star and perhaps a companion, a set of orbits around them, and whatever sits in those orbits — worlds, gas giants, and planetoid belts.

1.2 A system is a seed, a name, and whatever the user has typed over what was rolled. Nothing generated is stored, as the planet spec 1.3 has it for a surface and the subsector spec 1.2 for a chart.

1.3 Every world in a system is a planet of the planet spec, with its own seed and its own surface. The system decides how many worlds there are and where they sit; it does not generate terrain, and it never will.

1.4 The level exists because the subsector spec 3.8.3 had nowhere to put a second world. A chart hex draws one world and two counts because that is what a sector line carries, not because that is all a system is.

1.5 **The main world is the system's face.** It is the world the chart draws, the world the sector line describes, and the world a user means when they name the system. Everything here is arranged so that the main world is exactly the world the levels above already believe in.

### 1.6 What generates what

1.6.1 The system reads its main world's **profile** and does not write it. The main world's UWP is `rollUwp(worldSeed)` untouched, as the subsector spec 1.3.1 requires, and the chart and the system show the same digits because neither of them changed any.

1.6.1.1 The profile is what the levels above have already committed to. It is on the chart, it is in the sector line, and a user who clicked a hex expecting an A-class port and a billion people has to find them.

1.6.2 The system does write a world's **settings** - its orbit, and what follows from its star. Those are the nullable fields of the planet spec 6.15, where null means the rolled value stands and a value means somebody overruled it. A system filling one in is somebody overruling it, on the same terms as a user typing in the box.

1.6.2.1 So the star and its orbits are rolled in their own right, and the world is then placed in them and told where it ended up. This is the ordinary direction - generate the system, put the world in it - and it is available because the planet spec already built a world's settings to be overruled from outside.

1.6.2.2 The two halves are what keep this coherent. The profile is read, so a world is the world the chart drew. The settings are written, so a world is in the system it is actually in. Nothing is generated twice, and no two levels hold an opinion about the same number.

1.6.3 The counts of belts and gas giants are likewise read rather than rolled: they come from `pbgFor` in [src/gen/trade.ts](src/gen/trade.ts), which the subsector spec 3.3.3 already puts on the chart and in the sector line. The system places exactly that many. PBG is the contract between the two levels, and this level honours it rather than restating it.

1.6.4 The one thing this level does generate for the levels above is the stars, which the subsector spec 3.7 puts in the Stars column. Section 11 says how the chart gets them without generating a whole system for each of eighty hexes.

## 2. The star or stars

2.1 The primary has a spectral class — O, B, A, F, G, K, or M — and a size, from supergiant down through the main sequence to white dwarf.

2.2 The draw is weighted towards the small and the long-lived. Most of the sky is K and M dwarfs, and a chart where every third system is a blue giant is a chart nobody believes.

2.2.1 Weighted rather than uniform, and weighted rather than accurate. A truly representative draw would make M dwarfs three systems in four and leave a subsector with nothing to look at. The weighting leans towards the real distribution and stops short of it, which is the same compromise the planet spec makes wherever a real distribution is dull.

2.3 A companion is drawn for roughly one system in three. Where there is one it has its own class and size, drawn under the same weighting, and it is never larger than the primary.

2.3.1 No third star, for the reason the subsector spec 3.7.2.1 gives: a binary changes how a system is travelled, a trinary changes a line of text.

2.3.2 A companion drawn brighter than the primary is drawn again, and where several attempts all come up brighter the pair is a matched one: the companion takes the primary's own class and size. Equal is not brighter, so the pair is still named the right way round, and the case only arises where the primary is already about as dim as a star gets and there is nothing dimmer to draw.

2.4 A companion is either **close**, orbiting inside where any world sits, or **far**, orbiting outside every world. Nothing orbits between the two stars.

2.4.1 This is the simplification that lets section 3 have one set of orbits rather than three. A real binary has orbits around each star and around the pair, and modelling that is a week of work to produce a diagram most referees will read as "there are two suns".

2.4.2 A close companion lights the system and a far one does not. Every orbit is outside a close pair, so a world in one sees both stars close together in its sky and takes the light of both; a far companion is outside every orbit and is a bright star in the night rather than a second sun. The habitable zone, where the worlds are placed, and the star setting a world carries away under 5.2.2.1 are all worked out on that total.

2.4.2.1 Getting this wrong is visible on the diagram rather than buried: the zone is drawn where one star's light would put it and the main world sits outside the band it belongs in. Two stars of a Sun each make a zone half again as far out as one does, and a reader can see that the mark is on the wrong orbit.

2.5 The star is rolled in its own right, and no draw is rejected for being inconvenient. A world in a system with an awkward star is a world with an awkward star, and 5.2 puts it in the best orbit that star has rather than redrawing until the system is comfortable.

## 3. Orbits

3.1 A system has a numbered sequence of orbits outward from the primary. How many depends on the primary: a large, hot star sweeps and scatters the inner ones, a small one has few that are far enough out to matter.

3.2 Each orbit has a distance, and from the primary's class and size comes a **habitable zone**: the orbit or two where a world could have liquid water and an atmosphere worth breathing.

3.3 The habitable zone is derived from the star, and the star is rolled before anything is placed. So the arithmetic runs: roll the star, lay out its orbits, find the habitable zone, then fill the orbits under sections 4 to 6.

3.4 Orbits are drawn and described as slots, not as astronomy. A referee needs to know what is nearer the sun than what, how far a trip across the system is, and which rock is the warm one.

3.4.1 Distances are stated in AU to one or two figures, which is as precise as anything here deserves. A figure to five places would be claiming a survey nobody made, which is the planet spec 6.24.4's objection to writing a population to the last person.

## 4. What fills an orbit

4.1 An orbit holds a world, a gas giant, a planetoid belt, or nothing.

4.2 The gas giants and the belts are placed to the counts of 1.6.3, exactly. Gas giants go to the outer orbits, belts to the gaps where a world would have formed and did not, which is where a real belt is.

4.2.1 Except where there are not enough orbits to hold them. The counts were drawn from a seed under the planet spec 6.16.2 with nothing knowing what star they would have to fit around, and a star whose inner orbits are swept away or which reaches nowhere can have fewer orbits than the counts ask for. What fits is placed, and the system says how many that was.

4.2.2 Placing what fits rather than stacking two gas giants in one orbit, and saying so rather than quietly amending the chart's figures. The disagreement is real: it is the price of 1.6.3, where the counts are read from a level that could not have known. A system that reported the amended figures would be the tail wagging the chart.

4.3 Empty orbits are normal and stay empty. A system with every slot filled reads as a generator that could not leave anything out.

4.4 The main world takes the orbit section 5 gives it. Every remaining orbit draws whether it holds a world at all, and section 6 says what that world is.

4.5 Gas giants carry moons, and each one is a world: its own seed, its own surface, and its own profile, openable exactly as any other world of a system is.

4.5.1 A moon is generated by the rules of section 6 like everything else that is not the main world, with one difference: its size is held down to what a moon can be. Everything social follows 6.4 unchanged, so a moon can have people on it on the same terms as any other world, which is as it should be - a gas giant's moon has gravity, ices, and a fuel stop with a view, and Traveller is full of them.

4.5.2 Held down rather than rolled small. The physical digits are the moon's own seed's under 6.3, and a seed that rolls an Earth would otherwise put one in orbit around a gas giant. The size is brought to the limit and the air and water are brought down with it, since both are held by the gravity it no longer has.

## 5. The main world

5.1 The main world's seed is derived from the system seed, and its profile is `rollUwp` of that seed, unmodified. Under the subsector spec 3.1.3 the chart derives the same seed from the same hex, so the chart and the system agree by construction rather than by being checked against each other.

5.2 Its orbit is the best one the rolled star has for the profile it already has. A world with water and a breathable atmosphere goes in the habitable zone where there is one to be had; a hot, thin-aired rock goes inside it; an ice-bound one goes outside.

5.2.1 Best available rather than ideal. The planet spec 6.15 derives an orbital distance from the profile, and that figure is what the world is matched against, but the star was rolled without reference to it and may have nothing at that distance. The world goes to the nearest orbit that exists.

5.2.1.1 For a world with water and air, the zone comes first and the distance chooses within it. The two are different readings of the same question and they do not always agree: the zone is what the star offers a world in general, and the planet spec's distance is what one world's own air and cloud make of it. Where they disagree the zone wins, because the zone is what is drawn.

5.2.1.2 A world of that description sitting one orbit outside the band marked habitable reads as a mistake, whatever the arithmetic behind it was. The mark and the world are both on the diagram and a reader will take them together.

5.2.2 The orbit it lands in is then written into the world's orbit setting, under 1.6.2. A world in a system knows where it is, rather than falling back on where a world of its description usually is.

5.2.2.1 The star's output is written with it, into the world's own star setting at the planet spec 6.15.13. The distance alone would not be enough: a tenth of an AU is a furnace around one star and a cinder around another, and a world that carried only the distance would be a different world the moment it was opened away from its system.

5.2.2.2 So a save holds everything its surface is built from, and a world lifted out of a system opens as the world that system made. That is what the planet spec 6.15.13.2 is for, and it is the reason this level writes two figures rather than one clever one.

5.2.2.3 The alternative was to write a sunlight-equivalent distance - what the world's orbit would be if its star were the Sun - and leave the planet knowing nothing of stars. It was rejected: a referee reading a world's orbit would find a figure that was not where the world is, the system diagram and the world panel would disagree about a number both of them call the orbit, and the world's year would be worked out from a distance it does not have. A world carrying its own star is longer to write and true everywhere.

5.2.3 That reaches the surface. The planet spec 6.15 has orbit feed climate, and climate feed ice, life, and ground cover, so a world placed further out than its profile expected is colder than the same seed opened alone. This is intended, and 6.6 argues it out for every world rather than twice.

5.2.4 Tide-locking needs nothing written. With the star and the orbit both in the save, the planet spec works out for itself how far tides have reached, and a world in the habitable zone of a red dwarf comes up locked because that is what the pair of figures says. Nothing else is set from the system either: tilt, craters, and the rest stay the planet's own.

5.3 Which world of a system is the main world is not a question this level asks. It is the world the chart names, and the chart named it before the system existed.

5.3.1 Traveller's own generation picks a main world by population, and a system generated from scratch would have to. Here the main world is given, and the rest of the system is built around it, so the question does not arise. This is 1.6.1 again, in the place it is most tempting to forget.

## 6. The other worlds

6.1 Every orbit that is not the main world's, not a gas giant's, and not a belt's may hold another world. Each has its own seed, derived from the system seed and the orbit number.

6.2 Another world is a planet of the planet spec. It has a surface, a globe, and a local panel, and it opens exactly as the main world does.

6.3 Its physical profile — size, atmosphere, and hydrographics — is `rollUwp` of its seed, adjusted for where it sits: a world far outside the habitable zone has no liquid water, one far inside has no atmosphere worth the name.

6.4 Its social profile — starport, population, government, law, and technology — is not rolled independently. A world in a system is settled from that system's main world, so its population is a long way below the main world's, its technology is the main world's or a little under, and its starport is what that population supports.

6.4.1 Rolling a second mainworld in the next orbit out is the error this clause exists to prevent. Traveller's main world rules assume the world being rolled is the reason anybody came to the system, and applied to a moon of a gas giant they produce a moon with its own interstellar port and a billion people on it.

6.4.2 A settled second world keeps its system's government, since a colony is not a country of its own, and its law within a point of the main world's. Its starport is what the traffic it sees can support, which is no better than a C and usually an E.

6.4.3 A system whose main world holds nobody settles nothing. There was no one to settle from.

6.5 Most systems have no other inhabited world, and most other worlds are empty rock. A busy system is the exception and should read as one.

6.5.1 As generated, about one system in eleven has somebody living anywhere but its main world, and those places hold hundreds to tens of thousands rather than millions. An orbit with a mining camp on it is worth noticing, and it stops being worth noticing when every rock has one.

6.5.2 Rather more than half the orbits a system's belts and gas giants have not claimed hold a world of some kind, which is between one and two other worlds in the average system. They are almost all airless rock, and they are there because a system with one world in it and nine empty slots reads as a system the generator gave up on.

### 6.6 The seam

6.6.1 A world generated in a system is not, field for field, what its bare seed alone would produce. Its orbit is written under 5.2.2, and a secondary world's social digits under 6.4. That is a departure from the subsector spec 1.3.1, and it is worth being plain about rather than left to be discovered.

6.6.2 It is not a contradiction of it. Every field a system writes is a stored field of a planet that the user may type over anyway: a UWP under the planet spec 6.7, an orbit under 6.15. A value arriving from a system is that field arriving filled in, exactly as one arriving from a chart or from the user is. What a seed fixes is the surface given the settings, and that is as true here as anywhere.

6.6.2.1 Put the other way round: nothing a system writes is something the planet generator held an unshakeable opinion about. It writes into the boxes the planet spec 6.15 built for exactly this, where null means nobody has said and a value means somebody has.

6.6.3 What follows is that the written values travel with the world. They go into the system document, and into the world's own save if one is made, rather than being re-derived. A world opened from nothing but its bare seed comes up with the settings its profile implies, which is the same world in a system nobody specified: right for a world that has no system, wrong for one that has.

6.6.4 So a world reached through a system should be reached through its system. The route exists at every level under the app spec 6.1, the files of the app spec 4.2 sit in the system's folder for the same reason, and a world lifted out of one is a world that has been told to forget where it was.

6.6.5 The main world is no exception now. 5.1 leaves its profile alone, which is what the chart needs, but 5.2.2 writes its orbit like any other world's. The main world differs from the others in its profile and in nothing else.

## 7. Names

7.1 The system is named for its main world, which the subsector spec 3.4 named. A system does not get a name of its own.

7.2 A planet is the system name, a hyphen, and which planet it is, counting outward from one: the third planet of Sol is Sol-3. Moons are the planet and a letter, Sol-5a.

7.2.1 Counted rather than taken from the orbit's own number. The orbits are slots in a table that starts closer in than most systems have anything, so an orbit number would be a fact about the table rather than about the system, and a system whose innermost slot held a world would have a Sol-0 in it. A reader counts planets, and the third planet of Sol is Earth whether or not there is a slot inside Mercury's.

7.2.1.1 What this costs is that a name says which planet rather than where: two systems' third planets are both -3 wherever their orbits happen to fall. The distance is on the diagram, in the panel, and beside the name in the tree, so nothing is lost that was being read off the name.

7.2.2 Arabic and hyphenated rather than the Roman numeral a catalogue would use, because this is a filename as much as a label: it is the stem every file of that world is saved under, at the app spec 4.2.1. Sol III reads better and sorts worse.

7.2.3 The main world is named this way too. It is the third orbit of its system before it is anything else, and the system name alone belongs to the system.

7.3 A world with people on it takes a name of its own as well, drawn from the flavour machinery of the planet spec 6.24.6 with the system's own flavour, and the main world's is the one the chart gave it under the subsector spec 3.4. People name where they live; a numbered rock is a rock nobody stayed on.

7.3.1 As well as, not instead of. The name is what the world is called and 7.2 is where it sits, and a referee needs both: the app spec 4.2.1.1 saves under the second, and everything a player sees uses the first. Where a body has a name of its own, the panel says what it is filed under beside it.

7.3.2 The names of one system are one draw. The machinery picks a flavour and then makes as many names as are asked for without repeating itself, so a system's places sound like each other's neighbours and no two of them are called the same thing.

7.3.3 The system's name is the first of that draw, and it is the main world's. A main world that has no name of its own lends none, and the system is still called that first name, because an empty rock is a place on a chart rather than somewhere with a name and the system has to be called something.

7.3.4 Not everywhere people live is named. A place is named by the people who stayed there, and a few dozen working a rock have often never bothered: it was Corrise-8b when they landed and nobody has called it anything else since. So the likelihood follows the population - a world with millions on it has been called something for centuries, an outpost of forty has a contract number - and the designation of 7.2 is what a place without a name of its own is called.

7.3.4.1 A main world is the exception to the exception: it always has a name. It is the reason anybody came to the system, the system is called after it, and the chart above named it before the system was ever laid out. What a chart hands down is taken, since a world must not be called two things depending on which level is looking at it.

7.3.4.2 This is why 7.2 is the naming and 7.3 is the exception rather than the other way round. Every body in a system has a designation and always did; a name is a thing that happened to some of them afterwards.

7.4 A gas giant is a planet and is counted as one. A belt is not, and takes a numbering of its own: the system name, Belt, and which belt it is, so Sol Belt-1 is the one between Mars and Jupiter.

7.4.1 Counted apart so that a belt does not push the planets beyond it along. A system with a belt at its second orbit still has a third planet, and it is the third thing anybody would point at.

## 8. Display

8.1 The system is drawn as an orbit diagram: the star or stars at one end and the orbits laid out from it, each slot holding what it holds.

8.2 Schematic rather than to scale. A system to scale is a dot, a few invisible specks, and an expanse of nothing — the outer orbits are hundreds of times the inner ones, and a picture honest about that is a picture of empty space.

8.2.1 The distances are stated in the panel, under 3.4.1, which is where a number belongs. The diagram is for what is where, in what order, and how far out the habitable zone is.

8.3 The habitable zone is marked on the diagram, since it is why most of the systems that matter matter.

8.4 Selecting an orbit fills a panel: for a world, its profile digit by digit as the planet spec 6.7 shows it, its trade classifications, its seed, and the button that opens it as a planet; for a belt or a gas giant, what there is to say.

8.5 The main world is marked as the main world wherever it appears. 5.3 says the chart already decided, and a user coming down from the chart should see which one they came for.

8.6 A header carries the stars, the counts of 1.6.3, and the system's place — sector, subsector, hex — so the chain of the app spec 6.5 is visible from inside.

## 9. System data and persistence

9.1 A save contains the following.

| Field | Notes |
| --- | --- |
| Level | `system`, under the app spec 4.1. |
| Version | As the planet spec 6.4.2 requires. |
| Name | The main world's, see 7.1. Free text. |
| Sector, subsector, hex | Where the system sits, in the terms of the subsector spec 2.2. |
| Seed | Required. Without it nothing can be rebuilt. |
| Main world profile | The UWP of 5.1, so the system stands alone under the app spec 4.8. |
| Overrides | Per orbit, only where the user changed something. |

9.2 A save holds no generated orbit, world, or surface. Load rebuilds the lot from the seed, as the planet spec 6.3 rebuilds a surface and the subsector spec 5.2 an eighty hex chart.

9.2.1 The settings a system writes into its worlds under 1.6.2 are not stored either, because the system that wrote them is rebuilt first and writes them again. They are stored in the one place they would otherwise be lost: a world's own planet file, when one is saved, where they go in as ordinary settings under the planet spec 6.15. That is 6.6.3 met by the file format rather than by a rule.

9.3 An override holds only what was changed: what an orbit contains, a world's profile or name, the stars, the counts, or free prose about any of it. The subsector spec 5.3.1 gives the reason, and it is the same reason at every level.

9.4 An override never changes a seed. A world edited is still the world its seed makes, wearing what the referee wrote on it.

9.5 The system folder is the app spec 4.3, and it is the lowest folder the application makes: this document, and the files of each world the user has worked up and saved, named by 7.2.

9.6 Unsaved edits are tracked and warned about, under the app spec section 7.

## 10. Exporting the system

10.1 A system sheet: the stars, the orbits in order, and every world with its profile, as a readable document. The planet spec 6.19 writes one world up this way and this is the same idea a level out.

10.2 The orbit diagram as a PNG, drawn by the renderer that draws the panel.

10.3 A CSV of the orbits, one row each, for a referee who wants it in a spreadsheet.

10.4 No sector line. A system's line is its main world's, and the subsector spec section 6 writes it.

## 11. What the chart reads

11.1 The chart of the subsector spec needs three things from this level for each of eighty hexes: the stars, and nothing else. The counts are already `pbgFor` under 1.6.3, and the main world is already `rollUwp` under 5.1.

11.2 So the star draw of section 2 is a function of the system seed and the main world's profile, separable from the rest of the generation and cheap enough to run eighty times. The chart calls that and stops; it does not lay out orbits it will never draw.

11.3 The subsector spec 3.7 describes the star draw as the chart's. It is this level's, and the chart reads it. The clause stands with that correction — the draw and the weighting it describes are the ones in section 2 here.

11.4 A hex's system is generated in full when the user opens it, and not before. Eighty full systems for a chart that draws one world each is work nobody asked for.

## 12. Build order

12.1 **The stars.** Section 2, as the separable function of 11.2. It is what the subsector spec's step 8.3 needs, so this level's first piece is the one the level above is already waiting on.

12.2 **Orbits and filling them.** Sections 3 and 4, honouring the PBG contract of 1.6.3. Tested by generating a system and checking its belt and gas giant counts against `pbgFor` for the same seed.

12.3 **The main world in its orbit.** Section 5, including the settings written back under 5.2.2. Tested by the two claims that matter: the profile the system shows equals `rollUwp(worldSeed)` and equals what the chart drew, and a world saved out of a system carries the orbit the system put it in.

12.4 **The other worlds.** Section 6, including the seam of 6.6 and the tests that pin it down.

12.5 **The diagram and the panel.** Section 8, read only.

12.6 **Overrides, persistence, and navigation.** Section 9, and the joins of the app spec 6.1.

12.7 **Exports.** Section 10.

12.8 Steps 12.1 to 12.4 are the design. Everything after is work.

## 13. Open questions

13.1 **Satellites as main worlds.** Moons are worlds now, under 4.5.1, and a moon with people on it opens like anywhere else. What is still not done is making one *the* main world - the world the chart draws and the sector line describes - which would mean the hex's profile and its PBG coming from something in orbit around something else. The rest of this document reads the main world as a world of the primary throughout, and that is the work.

13.2 **Worlds in belts.** A belt is a count and a name. Whether individual rocks in one deserve to be places — the mining station, the hideout — is a question about points of interest more than about generation, and the planet spec 6.5 may already be the answer at the wrong scale.

13.3 **Where the companion's own worlds are.** 2.4 keeps every world around the primary and puts the companion outside or inside all of them. A close companion with worlds of its own is a real arrangement and an awkward diagram.

13.4 **Travel times.** The orbits have distances, so the arithmetic for a trip across a system at a given acceleration is available and small. Whether a spec about generation should carry a calculator is a fair question.

13.5 **Whether secondary worlds should be full planets.** They are, under 6.2, and that is tens of thousands of hexes of surface generated for a rock nobody will land on. The cost is paid only when one is opened, so this is a question about whether the route should exist rather than about performance. Left as it is: a referee who opens an ice moon deserves an ice moon.
