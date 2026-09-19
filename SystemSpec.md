# PlanetHex Systems

One star or several, the orbits around them, and the worlds in those orbits — the level between a hex on a subsector and a planet with a surface.

This document sits under [SubSectorSpec.md](SubSectorSpec.md) and over [PlanetSpec.md](PlanetSpec.md), and [AppSpec.md](AppSpec.md) 1.1 places it among the four levels. It is numbered the same way, so the code can cite it. *The planet spec*, *the subsector spec*, and *the app spec* mean those three documents.

## Contents

1. [Purpose](#1-purpose)
2. [The star or stars](#2-the-star-or-stars)
3. [Orbits](#3-orbits), and [where round one a body has got to](#35-where-round-its-orbit-a-body-has-got-to)
4. [What fills an orbit](#4-what-fills-an-orbit)
5. [The main world](#5-the-main-world)
6. [The other worlds](#6-the-other-worlds)
7. [Names](#7-names)
8. [Display](#8-display)
9. [System data and persistence](#9-system-data-and-persistence)
10. [Exporting the system](#10-exporting-the-system)
11. [What the subsector reads](#11-what-the-subsector-reads)
12. [Build order](#12-build-order)
13. [Open questions](#13-open-questions)

---

## 1. Purpose

1.1 A system is what one hex of a subsector map holds: a primary star and perhaps a companion, a set of orbits around them, and whatever sits in those orbits — worlds, gas giants, and planetoid belts.

1.2 A system is a seed, a name, and whatever the user has typed over what was rolled. Nothing generated is stored, as the planet spec 1.3 has it for a surface and the subsector spec 1.2 for a subsector.

1.3 Every world in a system is a planet of the planet spec, with its own seed and its own surface. The system decides how many worlds there are and where they sit; it does not generate terrain, and it never will.

1.4 The level exists because the subsector spec 3.8.3 had nowhere to put a second world. A subsector hex draws one world and two counts because that is what a sector line carries, not because that is all a system is.

1.5 **The main world is the system's face.** It is the world the subsector draws, the world the sector line describes, and the world a user means when they name the system. Everything here is arranged so that the main world is exactly the world the levels above already believe in.

### 1.6 What generates what

1.6.1 The system reads its main world's **profile** and does not write it. The main world's UWP is `rollUwp(worldSeed)` untouched, as the subsector spec 1.3.1 requires, and the subsector and the system show the same digits because neither of them changed any.

1.6.1.1 The profile is what the levels above have already committed to. It is on the subsector, it is in the sector line, and a user who clicked a hex expecting an A-class port and a billion people has to find them.

1.6.2 The system does write a world's **settings** - its orbit, and what follows from its star. Those are the nullable fields of the planet spec 6.15, where null means the rolled value stands and a value means somebody overruled it. A system filling one in is somebody overruling it, on the same terms as a user typing in the box.

1.6.2.1 So the star and its orbits are rolled in their own right, and the world is then placed in them and told where it ended up. This is the ordinary direction - generate the system, put the world in it - and it is available because the planet spec already built a world's settings to be overruled from outside.

1.6.2.2 The two halves are what keep this coherent. The profile is read, so a world is the world the subsector drew. The settings are written, so a world is in the system it is actually in. Nothing is generated twice, and no two levels hold an opinion about the same number.

1.6.3 The counts of belts and gas giants are likewise read rather than rolled: they come from `pbgFor` in [src/gen/trade.ts](src/gen/trade.ts), which the subsector spec 3.3.3 already puts on the subsector and in the sector line. The system places exactly that many. PBG is the contract between the two levels, and this level honours it rather than restating it.

1.6.4 The one thing this level does generate for the levels above is the stars, which the subsector spec 3.7 puts in the Stars column. Section 11 says how the subsector gets them without generating a whole system for each of eighty hexes.

## 2. The star or stars

2.1 The primary has a spectral class — O, B, A, F, G, K, or M — and a size, from supergiant down through the main sequence to white dwarf.

2.2 The draw is weighted towards the small and the long-lived. Most of the sky is K and M dwarfs, and a subsector where every third system is a blue giant is a subsector nobody believes.

2.2.1 An empty system gets the sky's own draw, which is near enough the real distribution and near enough Traveller's own table: both are mostly M and K. O and B are a trace rather than a fortieth. In Book 6 they cannot be rolled at all without the referee adding a modifier to reach them, and at a trace a sector of 1,280 hexes still holds a handful, which is what a landmark is for.

2.2.2 A system with a settled world in it gets a different draw, leaning towards F, G and K. The sky is mostly red dwarfs and the Imperium is mostly not, because those are not the same question.

2.2.2.1 The reason is in 3.2.2. A red dwarf's habitable orbit is a tenth of an AU out, inside the reach of its own tides, so the world in it is tidally locked with one face scorched and the other frozen, and the star flares across the lit one. Nobody put a class A starport and three billion people there while a G was going spare a parsec away. The systems a subsector gives people to are the comfortable ones and the red dwarfs are the quiet hexes between them, which is a truer picture of a settled sector than an even draw and a better one to play in.

2.2.2.2 G and K lead it rather than F and A, because an F burns out in a couple of billion years and an A in a few hundred million, and the Imperium has been at this for longer than that.

2.2.2.3 Blended by the population digit rather than switched, so a mining camp is somewhere a mining camp would be and a hive world is somewhere worth living. Full weight by population 6.

2.2.2.4 The size is leaned the same way, and very nearly always comes out the main sequence. A supergiant has a few million years to live and a white dwarf has already killed everything it had, so neither is where anybody builds a starport. A subgiant is allowed, being a star visibly on its way off the sequence and a good line for a referee to use.

2.2.2.5 Read off the system's own seed and not handed in, so a star is still a function of the seed alone and the subsector and the system cannot disagree about it. The profile read is the one the system's main world rolls for itself, before any lean the referee has put on the subsector under the subsector spec 3.11: the star does not know about that, and a subsector turned up to teeming should not quietly reclass its suns.

2.2.3 Two size and class pairs are not drawn at all, which is Traveller's blank columns, and it is right about both. There is no K or M subgiant, because a star that small takes longer to leave the main sequence than the universe has existed. There is no subdwarf hotter than an F. Either draw falls back to the main sequence.

2.3 A companion is drawn for roughly one system in three. Where there is one it has its own class and size, drawn under the same weighting, and it is never larger than the primary.

2.3.1 No third star, for the reason the subsector spec 3.7.2.1 gives: a binary changes how a system is travelled, a trinary changes a line of text.

2.3.2 A companion drawn brighter than the primary is drawn again, and where several attempts all come up brighter the pair is a matched one: the companion takes the primary's own class and size. Equal is not brighter, so the pair is still named the right way round, and the case only arises where the primary is already about as dim as a star gets and there is nothing dimmer to draw.

2.4 A companion is either **close**, orbiting inside where any world sits, or **far**, orbiting outside every world. Nothing orbits between the two stars.

2.4.1 This is the simplification that lets section 3 have one set of orbits rather than three. A real binary has orbits around each star and around the pair, and modelling that is a week of work to produce a diagram most referees will read as "there are two suns".

2.4.2 A close companion lights the system and a far one does not. Every orbit is outside a close pair, so a world in one sees both stars close together in its sky and takes the light of both; a far companion is outside every orbit and is a bright star in the night rather than a second sun. The habitable zone, where the worlds are placed, and the star setting a world carries away under 5.2.2.1 are all worked out on that total.

2.4.2.1 Getting this wrong is visible on the diagram rather than buried: the zone is drawn where one star's light would put it and the main world sits outside the band it belongs in. Two stars of a Sun each make a zone half again as far out as one does, and a reader can see that the mark is on the wrong orbit.

2.5 The star is rolled in its own right, and no draw is rejected for being inconvenient. A world in a system with an awkward star is a world with an awkward star, and 5.2 puts it in the best orbit that star has rather than redrawing until the system is comfortable.

2.5 A star has a size in kilometres, and it is not rolled. Brightness is area times how hard each piece of that area radiates, and the spectral class gives the second, so the class and the luminosity class already drawn between them fix it: a red giant is vast, a white dwarf is the size of a planet.

2.5.1 Except the white dwarf, which is held to about the size of the Earth however the arithmetic lands. It is degenerate matter rather than a smaller version of the star it was, and nothing in a spectral class knows that.

2.5.2 The size is here for one reason: 4.8 measures a jump shadow from it. Nothing else in this document needs to know how wide a star is.

2.6 The stars can be changed. A referee who wants this system round a red dwarf says so, and the system is laid out again around it.

2.6.1 Laid out again, not repainted. The habitable zone, the snow line and every orbit distance are worked out from what the star puts out, so a different star is a different arrangement of the same system — the seed is untouched and the worlds are the same worlds, somewhere else under a different sky. A K7 changed to an M7 loses an orbit and halves its jump shadow.

2.6.2 The primary only. What is being edited is the star the system is named for; a companion is a second question, and it keeps whatever was rolled, as does where it sits — that is not in the Stars column and so is not in what the referee typed.

2.6.3 Stored as the Stars column writes it, and only where it differs from the roll. Rolled back to what it was, the override goes, which is the rule every override in this document follows.

2.6.4 The subsector above is told. The Stars column is the subsector's, so a star changed here reaches the hex or the two levels describe one system differently.

## 3. Orbits

3.1 A system has a numbered sequence of orbits outward from the primary. The orbits are spaced the way the solar system's are, each one out a multiple of the last rather than a step further, so the inner ones are crowded and the outer ones are not.

3.1.1 The whole ladder is placed in sunlight-equivalent distance and multiplied out by the square root of the primary's luminosity. The light falling on a world is the star's output over the square of the distance, so every distance that means anything thermally - where water melts, where dust stops surviving, where a world freezes solid - sits at its sunlight-equivalent distance times that root. It is the inverse square law rather than a choice, and 6.15 of the planet spec has always placed a planet's own orbit that way; this is the same arithmetic one level up.

3.1.2 It is also what the sky looks like. TRAPPIST-1 puts out a two-thousandth of the Sun's light and holds seven planets between 0.011 and 0.062 AU, which are sunlight equivalents of half an AU out to two and a half: Venus to the asteroid belt. A ladder fixed in AU cannot draw that system. Its innermost orbit would be a sunlight-equivalent nine AU out, past Saturn, so every world around every dim star comes out a frozen rock and the habitable zone of 3.2 falls off the inner end of the system entirely.

3.1.3 A large, hot star having nothing close in then needs no rule of its own. The innermost orbit of a star sixty times the Sun's output is a full AU and a half, which is where its sweeping and scattering would have left it anyway.

3.1.4 Two distances do not scale, because neither is set by the star's light.

3.1.4.1 The floor is the Roche limit: closer than that, tides pull a rocky world apart. It works out as a figure in the star's mass alone, 0.0072 AU per cube root of a solar mass, because writing the star's density as its mass over its volume cancels its radius out. It is what the ladder needs a floor for: a white dwarf puts out a ten-thousandth of the Sun's light, so its scaled innermost orbit lands at a five-hundredth of an AU, and a rocky world there is the debris disc we actually see around white dwarfs rather than a planet.

3.1.4.2 The ceiling is how far out a disc of planets reaches at all, a hundred AU. A protoplanetary disc is a few hundred AU across and its size is set by the angular momentum of the cloud core it fell out of, not by the star's light. Without the ceiling a supergiant's innermost orbit lands two hundred AU out and its outermost most of a light year, which is not a planetary system.

3.1.5 How many orbits a system has is drawn, leaning on the primary's mass. With the ladder moving with the star, cutting it by what the star sweeps or lights would cut the same orbits off every star and say nothing at all. Real counts run from one to eight or more and follow the mass of the disc, which follows the mass of the star loosely and with enormous scatter, so the star leans on the draw rather than deciding it. The floor is set so that a system has the habitable orbit of 3.2 in it, whether or not anything is put there.

3.1.6 A star with no room between the two limits of 3.1.4 still gets one orbit. The subsector above has put a world in this hex and there has to be somewhere for it to go; it is somewhere nobody should be, and the figures say so.

3.2 Each orbit has a distance, and from the primary's class and size comes a **habitable zone**: the orbit or two where a world could have liquid water and an atmosphere worth breathing. The band is Kopparapu's optimistic limits, a sunlight-equivalent 0.75 to 1.84 AU, which is recent Venus at one end and early Mars at the other - two places we know held liquid water, which is a better pair of bounds than a bare rock's freezing point.

3.2.1 Because the ladder of 3.1.1 is the same ladder in sunlight for every star, the band is a band of orbit numbers and not one that some stars miss. A dim star has a habitable orbit; it is simply very close in.

3.2.2 And close in is where tides settle a world's spin, so around a dim star the habitable orbit is inside the despinning reach of the planet spec 6.12.3 and the world in it is tidally locked, with the temperature model of its 5.7.7. That is not an artefact. The habitable zone goes as the square root of the luminosity and the tidal reach as the cube root of the mass, and below about half a solar mass the first falls inside the second - which is why Proxima b and the TRAPPIST-1 planets are all expected to be locked.

3.3 The habitable zone is derived from the star, and the star is rolled before anything is placed. So the arithmetic runs: roll the star, lay out its orbits, find the habitable zone, then fill the orbits under sections 4 to 6.

3.4 Orbits are drawn and described as slots, not as astronomy. A referee needs to know what is nearer the sun than what, how far a trip across the system is, and which rock is the warm one.

3.4.1 Distances are stated in AU to one or two figures, which is as precise as anything here deserves. A figure to five places would be claiming a survey nobody made, which is the planet spec 6.24.4's objection to writing a population to the last person.

### 3.5 Where round its orbit a body has got to

3.5 An orbit says how far out a body is; where round it the body actually is, is the **date**. The setting has one, written the way Traveller writes one — a day of the year and a year, `001-1105` — and every body in every system is placed at it.

3.5.1 The seed fixes the angles at one fixed moment, and the date is measured from that moment. The moment is 001-1105, which is both Traveller's own present and what a document with nothing to say about a date reads as. So a system nobody has dated sits exactly where it always sat, and nothing anybody saved before there were dates has moved.

3.5.1.1 The seed rather than the date decides the arrangement, which is why both are kept. Two worlds at similar distances being a short hop or a long haul apart is a fact about the system and has to be the same fact every time it is opened. What the date chooses is which of that seed's arrangements is the one on screen.

3.5.2 A body advances by however much of its own year has gone by, so the inner system turns and the outer system barely moves. That is Kepler, and it is what makes the date worth having: a system a year on is not the same picture rotated, it is rearranged, and the gas giant that was a week away is now on the far side of the star.

3.5.2.1 The year is the same figure the panel states for that body, off the same arithmetic. A diagram going round at a speed the panel beside it disagrees with would be two systems.

3.5.2.2 All of them prograde, because a disc goes round the way it fell in. Nothing here would make one body of a system the exception, and a retrograde world drawn as one would be a curiosity the generator never rolled.

3.5.3 Nothing else moves with the date. What a system holds is its seed's, under 1.2: the stars, the orbits, the profiles and the counts are the same on any day of any year. The date reaches the angles and, through them, the distances of 4.9, and it stops there.

3.5.3.1 It does not reach a world's surface either. The planet spec 5.7.3.2 averages sunlight over a whole year, so no world in this application has a season for a date to fall in. A date that quietly moved the ice caps would be promising a model that is not there.

3.5.4 **One date, for everything that is open.** It is not a property of a system: a referee moving between two systems on the same evening is in one setting on one day, and two systems disagreeing about what day it is would be two settings.

3.5.4.1 It is edited on the system view, which is the only level that draws anything the date moves. A subsector and a sector carry it, because a save has to carry a thing to keep it, and neither of them has an orbit on it to show it with.

3.5.4.2 Whichever level is the top of what is open owns it, which is 9.7.3's rule with one more field under it. A subsector hands its date down to the systems beneath it as it hands down where they are, and a system dated from inside hands the new date back up to whatever is holding it.

3.5.5 A date before the epoch is a date. A referee running a campaign in 1080 is running one in 1080, and the arithmetic does not mind which way it counts.

3.5.6 The calendar is 365 days, with no leap and no months, which is Traveller's. Day 000 and day 366 are the two things the format lets somebody type and the calendar does not have, and both are refused.

## 4. What fills an orbit

4.1 An orbit holds a world, a gas giant, a planetoid belt, or nothing.

4.2 The gas giants and the belts are placed to the counts of 1.6.3, exactly. Gas giants go to the outer orbits, belts to the gaps where a world would have formed and did not, which is where a real belt is.

4.2.1 Except where there are not enough orbits to hold them. The counts were drawn from a seed under the planet spec 6.16.2 with nothing knowing what star they would have to fit around, and a star whose inner orbits are swept away or which reaches nowhere can have fewer orbits than the counts ask for. What fits is placed, and the system says how many that was.

4.2.2 Placing what fits rather than stacking two gas giants in one orbit, and saying so rather than quietly amending the subsector's figures. The disagreement is real: it is the price of 1.6.3, where the counts are read from a level that could not have known. A system that reported the amended figures would be the tail wagging the subsector.

4.2.3 A gas giant has a size: a Jupiter or a Neptune, with a spread inside each, since no two are the same width. The difference is worth holding rather than drawing every giant the same, because 4.8 measures its jump shadow from it — the giant everybody refuels at is the one they then have to crawl away from, and how long that takes depends on which kind it is.

4.3 A main world whose size digit is zero is an asteroid belt, and the orbit it takes holds that belt. Not a world and a belt in separate orbits, and not a world 0km across: the profile is the belt's, and the people in it live in the belt.

4.3.1 So the belt count of 1.6.3 cannot be zero for such a system, and the belt people live in is one of the count rather than an extra on top of it. A system that reported a belt main world and no belts would be contradicting itself in the same line.

4.3.2 The belt carries the profile, the seed and the main flag the world would have carried, and everything that reads a body's profile off an orbit finds it there too. Otherwise the same body is a world to the subsector above and a rock to the system, which is exactly the disagreement 11.1 exists to prevent — and it showed up as one: the subsector drew its scatter of rocks while the system drew a planet, for the same hex.

4.3.3 It is drawn as a belt everywhere it is drawn, because that is what it is. It has no globe: a belt is not a sphere to photograph. It opens as a planet like anything else, since the planet view is where a profile is worked out in detail and a belt has a profile.

4.4 Empty orbits are normal and stay empty. A system with every slot filled reads as a generator that could not leave anything out.

4.5 The main world takes the orbit section 5 gives it. Every remaining orbit draws whether it holds a world at all, and section 6 says what that world is.

4.6 Gas giants carry moons, and each one is a world: its own seed, its own surface, and its own profile, openable exactly as any other world of a system is.

4.6.1 A moon is generated by the rules of section 6 like everything else that is not the main world, with one difference: its size is held down to what a moon can be. Everything social follows 6.4 unchanged, so a moon can have people on it on the same terms as any other world, which is as it should be - a gas giant's moon has gravity, ices, and a fuel stop with a view, and Traveller is full of them.

4.6.2 Held down rather than rolled small. The physical digits are the moon's own seed's under 6.3, and a seed that rolls an Earth would otherwise put one in orbit around a gas giant. The size is brought to the limit and the air and water are brought down with it, since both are held by the gravity it no longer has.

4.7 A system records its bases, and where they are. The subsector draws a mark for a naval base or a scout way station; the system has to say which body they are at, because a base is somewhere and a referee arriving in a system wants to know which rock the navy is parked over.

4.7.1 They are at the main world. A naval base is a station in its orbit, a scout way station is a field on it or a tender beside it — neither is a body of its own, so neither takes an orbit, and both are marks on the world they belong to.

4.7.2 Derived from the main world's seed by the same rule the subsector derives it — the subsector spec 3.5 — rather than handed down. The subsector and the system then agree without either telling the other, which is 11.1 again: what both levels can work out, neither owns.

4.7.3 What a port can carry is what limits it: naval at class A and B, scout at A through D. A base without a port to service it is a base nobody can reach.

### 4.8 Jump shadows

4.8.1 Every mass in a system has a sphere round it that a ship cannot jump from, a hundred of its own diameters across. It is the one piece of astrography that decides how a system is actually travelled: where a ship arriving has to come out, how long one leaving has to run before it can go, and why the gas giant everybody refuels at costs more than the fuel.

4.8.2 A hundred diameters, not a mass. So the longest shadows belong to the widest bodies rather than the heaviest, and a bloated red giant casts one far longer than a white dwarf of the same mass. The rule is Traveller's and the consequence is the interesting part of it.

4.8.3 The system records shadows for the star and for every gas giant. Worlds have them too and they are small — a hundred Earth diameters is a bit over a million kilometres, three and a half hours at one gravity — while the primary's is most of an AU and is what a ship is actually waiting on.

4.8.3.1 Both stars of a close pair share one shadow. A companion riding beside the primary is well inside a hundred diameters of it, so a shadow drawn round each would be one shadow drawn twice.

4.8.4 Drawn on the model as a filled disc lying in the orbital plane, leaning with everything else on it. A shadow is really a sphere, but the question it answers is how far out along the plane a ship has to get before it can go, and a sphere drawn as a true circle stands up out of the picture and reads as a bubble in front of it rather than a distance in it.

4.8.5 The panel gives the figure in kilometres and in hours at one gravity, from a standing start and without stopping at the far end. To jump, a ship has to be outside the shadow, not at rest outside it.

### 4.9 Travel times

4.9.1 A referee's commonest question about a system is not what is in it but how long it takes to cross, and the answer is arithmetic nobody wants to do at the table. A manoeuvre drive is a constant acceleration, so a crossing is the schoolbook problem, and the numbers are unintuitive enough to be worth working out rather than guessing at: ten hours to the gas giant and three weeks to the outer belt is the difference between an adventure and a different adventure.

4.9.1.1 The panel gives them from whatever body is selected, at an acceleration the user sets and which starts at one gravity. Every body in the system except the moons: a moon is a destination once a ship is already at the giant, and a list with fifteen of them on it hides the twelve places a ship might actually be going.

4.9.2 Two figures for each, the second in brackets. The first is the run arriving stopped — half of it accelerating and half decelerating, which is how a ship with a constant-thrust drive actually travels and where the flip at the midpoint comes from. The second is burning the whole way and arriving fast, which is what matters when the point is to be somewhere rather than to stop there.

4.9.2.1 The first is always the longer, by exactly the square root of two, because half the run is spent slowing down. A million kilometres at one gravity is five and a half hours stopped or four straight through.

4.9.3 The first line is the run to the jump point: out of every jump shadow the ship is inside. There is always one to leave, since a ship at a world is inside that world's own shadow by definition, and around a dim star it is usually inside the star's as well. The question is never whether but how far.

4.9.3.1 The shortest run, not the run outwards. A ship leaving wants the jump point it can reach soonest, and only the shadows it is actually inside count towards that: one it is outside is one it has already cleared, and a shadow lying across one heading is a reason to pick another heading rather than a distance to add on.

4.9.3.2 Which way that is depends on what the ship is caught in, so the headings are tried rather than assumed. From a world inside its star's shadow the way out is straight out, and the arithmetic finds that on its own. From a world already outside it there is nothing to leave but the world's own, and any heading will do. From a ship at a gas giant far from its star it is off to one side, across a shadow a hundred giant-diameters wide rather than out past the orbit of everything.

4.9.4 Distances are taken from where the model of 8.1.2 draws the bodies: each at its orbit's distance and at the angle 3.5 puts it at on the date. That arrangement is a picture of one day rather than an ephemeris to be integrated, and this document takes it as the truth — a referee reading the diagram and a referee reading these numbers have to be told the same thing, and a system where the worlds were somewhere else for the arithmetic would be two systems.

4.9.4.1 So a crossing is a crossing on the day it is asked about, and the figures move as the date does. That is the honest answer and it is a good part of why 3.5 exists: the run to the gas giant really is ten hours some months and three weeks others, and one number for it all year would be wrong most of the year.

4.9.4.2 A belt is a ring rather than a place, so a crossing to one is a crossing to its nearest part. A ship going to the belt goes to the near edge, not to an agreed point on the far side of the star.

## 5. The main world

5.1 The main world's seed is derived from the system seed, and its profile is `rollUwp` of that seed, unmodified. Under the subsector spec 3.1.3 the subsector derives the same seed from the same hex, so the subsector and the system agree by construction rather than by being checked against each other.

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

5.3 Which world of a system is the main world is not a question this level asks. It is the world the subsector names, and the subsector named it before the system existed.

5.3.1 Traveller's own generation picks a main world by population, and a system generated from scratch would have to. Here the main world is given, and the rest of the system is built around it, so the question does not arise. This is 1.6.1 again, in the place it is most tempting to forget.

## 6. The other worlds

6.1 Every orbit that is not the main world's, not a gas giant's, and not a belt's may hold another world. Each has its own seed, derived from the system seed and the orbit number.

6.2 Another world is a planet of the planet spec. It has a surface, a globe, and a local panel, and it opens exactly as the main world does.

6.2.1 Opening one says nothing about it. Its name is in the header and in the trail, how far out it sits was in the panel it was opened from and is in its own description, and a line repeating either is a line a reader learns to stop reading. The status line is for what the user cannot otherwise see.

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

6.6.2 It is not a contradiction of it. Every field a system writes is a stored field of a planet that the user may type over anyway: a UWP under the planet spec 6.7, an orbit under 6.15. A value arriving from a system is that field arriving filled in, exactly as one arriving from a subsector or from the user is. What a seed fixes is the surface given the settings, and that is as true here as anywhere.

6.6.2.1 Put the other way round: nothing a system writes is something the planet generator held an unshakeable opinion about. It writes into the boxes the planet spec 6.15 built for exactly this, where null means nobody has said and a value means somebody has.

6.6.3 What follows is that the written values travel with the world. They go into the system document, and into the world's own save if one is made, rather than being re-derived. A world opened from nothing but its bare seed comes up with the settings its profile implies, which is the same world in a system nobody specified: right for a world that has no system, wrong for one that has.

6.6.4 So a world reached through a system should be reached through its system. The route exists at every level under the app spec 6.1, the files of the app spec 4.2 sit in the system's folder for the same reason, and a world lifted out of one is a world that has been told to forget where it was.

6.6.5 The main world is no exception now. 5.1 leaves its profile alone, which is what the subsector needs, but 5.2.2 writes its orbit like any other world's. The main world differs from the others in its profile and in nothing else.

## 7. Names

7.1 The system is named for its main world, which the subsector spec 3.4 named. A system does not get a name of its own.

7.2 A planet is the system name, a hyphen, and which slot it is in, counting outward from one: a world in the third orbit is Sol-3. Moons are the planet and a letter, Sol-5a.

7.2.1 The slot rather than a count of the bodies inside it, so a designation says where a body is and not how many things happen to lie between it and the star.

7.2.1.1 Two consequences, both of them the point. The numbers skip where an orbit is empty — Sol-1, Sol-3, Sol-7 — which is how a catalogue of a real system reads and is a fact worth having on the name. And a body's designation cannot change because something was added or taken away nearer the star, which matters when the designation is also the filename: a world saved as Sol-3 stays Sol-3.

7.2.1.2 Slots are numbered from zero inside the generator and from one everywhere a person reads one. Nothing is anybody's nought planet.

7.2.2 Arabic and hyphenated rather than the Roman numeral a catalogue would use, because this is a filename as much as a label: it is the stem every file of that world is saved under, at the app spec 4.2.1. Sol III reads better and sorts worse.

7.2.3 The main world is named this way too. It is the third orbit of its system before it is anything else, and the system name alone belongs to the system.

7.3 A world with people on it takes a name of its own as well, drawn from the flavour machinery of the planet spec 6.24.6 with the system's own flavour, and the main world's is the one the subsector gave it under the subsector spec 3.4. People name where they live; a numbered rock is a rock nobody stayed on.

7.3.1 As well as, not instead of. The name is what the world is called and 7.2 is where it sits, and a referee needs both: the app spec 4.2.1.1 saves under the second, and everything a player sees uses the first. Where a body has a name of its own, the panel says what it is filed under beside it.

7.3.2 The names of one system are one draw. The machinery picks a flavour and then makes as many names as are asked for without repeating itself, so a system's places sound like each other's neighbours and no two of them are called the same thing.

7.3.3 The system's name is the first of that draw, and it is the main world's. A main world that has no name of its own lends none, and the system is still called that first name, because an empty rock is a place on a subsector rather than somewhere with a name and the system has to be called something.

7.3.4 Not everywhere people live is named. A place is named by the people who stayed there, and a few dozen working a rock have often never bothered: it was Corrise-8b when they landed and nobody has called it anything else since. So the likelihood follows the population - a world with millions on it has been called something for centuries, an outpost of forty has a contract number - and the designation of 7.2 is what a place without a name of its own is called.

7.3.4.1 A main world is the exception to the exception: it always has a name. It is the reason anybody came to the system, the system is called after it, and the subsector above named it before the system was ever laid out. What a subsector hands down is taken, since a world must not be called two things depending on which level is looking at it.

7.3.4.2 This is why 7.2 is the naming and 7.3 is the exception rather than the other way round. Every body in a system has a designation and always did; a name is a thing that happened to some of them afterwards.

7.3.5 Rename the system and every body designated after it is renamed with it, everywhere it is called that: on the tree, in the panel, and in the worlds the referee has already worked on and put down. A designation is the system's name and a number, so a system called something else has bodies called something else, and a world left behind under the old name would be the one place still saying it.

7.3.5.1 Except what the referee named themselves. A name they typed is theirs and survives the rename, because they were naming that world and not spelling out the system's. What tells the two apart is whether a body is still called the designation the old system name gave it: a name that was only ever derived still matches it, and a chosen one does not.

7.3.5.2 The main world goes with the system rather than with its designation, under 7.3.4.1: the two are one name said once, so renaming either renames the other.

7.4 A gas giant is a planet and is designated as one. A belt says what it is: the system name, Belt, and its slot, so a belt in the fourth orbit is Sol Belt-4.

7.4.1 The same numbering as the planets, not one of its own, because they share the slots: one orbit holds one thing, so a belt and a planet can never collide on a number. A system with a belt in its fourth orbit has no fourth planet, and that is the truth about it rather than a clash to be worked around.

7.4.2 The word Belt is kept in the designation even though the number alone would be unambiguous, because a designation is read on its own — in a file name, in a tree, at the top of a panel — and a reader should not have to open the system to find out that Sol-4 is not somewhere they can land.

## 8. Display

8.1 The system is drawn twice, and the two drawings answer different questions.

8.1.1 A strip along the foot: the star at one end and the orbits laid out from it in order, one slot each. Schematic, and deliberately so — it is for what is where and in what order, and every slot gets the same room whether it is at 0.2 AU or 50.

8.1.2 A model in the middle: the same orbits as paths round the star, leaning, turnable and zoomable.

8.2 The model is to scale in distance. A path's radius is its orbit's distance, and the outermost path is the edge of the drawing. A system really is mostly empty with everything worth visiting bunched at the middle, and a model that spread the orbits evenly would be drawing the slots — which is 8.1.1's job, done better by a strip.

8.2.1 What that costs is the inner system, which at the whole-system view is a knot round the star. That is what the zoom is for, and it is why anything with a size of its own — a world, a star, a rock, a mark, a line — is drawn at a fixed size on the page rather than a fixed size in the drawing. Zooming in has to spread the orbits apart without inflating what sits on them, or it separates nothing.

8.2.1.1 The habitable band is the exception that proves it: its width is the zone's own width, which is a distance like all the others and scales with them. Only the margin drawn either side of it is a thing on the page. A band held to the page instead swallowed the view as soon as anybody zoomed in.

8.2.2 The distances are still stated in the panel and along the strip, under 3.4.1, which is where a number belongs. Nothing is written on the model itself.

8.3 The habitable zone is marked on both, since it is why most of the systems that matter matter.

8.4 Selecting an orbit fills a panel: for a world, its profile digit by digit as the planet spec 6.7 shows it, its trade classifications, its seed, and the button that opens it as a planet; for a belt or a gas giant, what there is to say.

8.4.1 The star can be selected too, on the model and at the head of the strip alike, and what it fills the panel with is the system: its class and size, what it puts out, how wide it is, its jump shadow and how long crossing that takes at a gravity, how many orbits sit inside the shadow and so cannot jump, where its habitable zone runs, and the counts of what the orbits hold.

8.4.1.1 Those are figures about the whole system, and this is where they belong, because the star is what they are all facts about. Carrying them in a block of summary rows above the body list made them something a reader learns to skip rather than somewhere they go to look one up, and it left the one figure with nowhere else to live - the jump shadow - reachable only by reading past the four that were already in the header.

8.4.1.2 The star is not an orbit and is reported as an orbit number that cannot be one. Everything that follows a selection - the panel, the strip, the model's highlight - already takes an orbit number, and handing it one keeps all three in step without a second path through any of them.

8.4.1.3 A companion picks out the same thing the primary does. What opens is the panel about the system's stars and there is one of those however many stars there are; the panel then says which of them is which, and 2.4.2 decides whether the pair's light is one figure or two.

8.4.1.4 No travel times. The panel of 4.9 is times from one body to another, and a star is neither somewhere a ship leaves from nor somewhere it arrives at.

8.5 The main world is marked as the main world wherever it appears. 5.3 says the subsector already decided, and a user coming down from the subsector should see which one they came for.

8.5.1 What the subsector marks against a hex is marked here against the body it is actually about, which is the main world: the naval base's star, the scout station's triangle, and the travel zone's dashed ring. The same three marks the subsector uses, so a referee who can read one can read the other.

8.5.2 A subsector has one hex to say them in and has to say them about the system. A system has the room to say which world the navy is parked over, and saying it is most of why somebody came down a level.

8.6 A header carries the stars, the counts of 1.6.3, and the system's place — sector, subsector, hex — so the chain of the app spec 6.5 is visible from inside.

8.6.1 And the date of 3.5, beside the place, because both answer where and when this is. It is the one field in that header that is about the setting rather than about this system, and it is here because this is the only level with anything on it that the date moves: change it and the model, the travel times and the strip are all redrawn at the new day.

8.7 The list of bodies down the left is one line to a body: its name, its profile, and what it is. The name is the part that gives way when there is not room for all three, because a profile and a kind are short, fixed, and say nothing half shown, while a name shortened is still a name that can be recognised.

8.7.1 The edge of that list is dragged. A body is named after its system under 7.2, so a system with a long name has a column of long names, and a width chosen to suit the names the generator draws suits a referee's own by luck. How much room the list needs is a fact about what they called things, so it is theirs to set.

8.7.2 Within limits: narrow enough to be a list, and never so wide that the model and the panel have been squeezed out to fit a name. The width is remembered between sessions, since it is a choice about the window rather than about any one system, and the lists at the levels above are the same list with the same edge.

## 9. System data and persistence

9.1 A save contains the following.

| Field | Notes |
| --- | --- |
| Level | `system`, under the app spec 4.1. |
| Version | As the planet spec 6.4.2 requires. |
| Name | The main world's, see 7.1. Free text. |
| Sector, subsector, hex | Where the system sits, in the terms of the subsector spec 2.2. |
| Seed | Required. Without it nothing can be rebuilt. |
| Date | The imperial date of 3.5. Absent reads as the epoch, so an older save opens where it was drawn. |
| Main world profile | The UWP of 5.1, so the system stands alone under the app spec 4.8. |
| Overrides | Per orbit, only where the user changed something. |

9.2 A save holds no generated orbit, world, or surface. Load rebuilds the lot from the seed, as the planet spec 6.3 rebuilds a surface and the subsector spec 5.2 an eighty hex map.

9.2.1 The settings a system writes into its worlds under 1.6.2 are not stored either, because the system that wrote them is rebuilt first and writes them again. They are stored in the one place they would otherwise be lost: a world's own planet file, when one is saved, where they go in as ordinary settings under the planet spec 6.15. That is 6.6.3 met by the file format rather than by a rule.

9.3 An override holds only what was changed: what an orbit contains, a world's profile or name, the stars, the counts, or free prose about any of it. The subsector spec 5.3.1 gives the reason, and it is the same reason at every level.

9.4 An override never changes a seed. A world edited is still the world its seed makes, wearing what the referee wrote on it.

9.4.1 Nor does the date, which is not an override. It is one value about the setting rather than something typed over a generated one, so it is a field of its own and it is always written, under 3.5.4.

9.5 The system folder is the app spec 4.3, and it is the lowest folder the application makes: this document, and the files of each world the user has worked up, named by 7.2.

9.5.1 A world opened from a system is held against that system while it is open, and written into the folder when the system is saved. A referee who names a world and goes back up to the system finds the name they gave it when they come down again; the alternative is the planet level undoing itself every time anybody looks at the system.

9.5.2 Held by the world's own seed. A designation moves when the system is renamed, and a world put down as Sol-3 would be looked for as Alpha-3 and not found.

9.6 Unsaved edits are tracked and warned about, under the app spec section 7.

9.7 Where a system sits — sector, subsector, hex — is typed where nothing above has answered and shown where something has. A system rolled on its own takes all three, because nothing else knows. A system opened out of a subsector takes all three from the subsector and none of them can be edited here: the hex is which square of that subsector the system is in, and typing another would have moved it out from under the subsector holding it.

9.7.1 The subsector is free text, on the same terms as the planet spec 6.14.2. The letter follows from the hex under 2.2.3 and what the subsector is *called* does not, so the field takes a name and offers the letter until somebody gives it one. Where a subsector handed the system down, the name is the subsector's own name, since they are one subsector named once.

9.7.2 The header says both where there are both — "1910 (Regina, subsector C)" — because a referee reads the name and a subsector files the hex under the letter, and neither is the other's abbreviation.

9.7.3 This is the same rule the levels above and below keep. A subsector in a sector takes its sector from the sector; a world in a system takes all three from the system, under the planet spec 6.14.4. Whichever level is the top of what is open owns where it is.

## 10. Exporting the system

10.1 A system sheet: the stars, the orbits in order, and every world with its profile, as a readable document. The planet spec 6.19 writes one world up this way and this is the same idea a level out.

10.2 The orbit diagram as a PNG, drawn by the renderer that draws the panel.

10.3 A CSV of the orbits, one row each, for a referee who wants it in a spreadsheet.

10.4 No sector line. A system's line is its main world's, and the subsector spec section 6 writes it.

## 11. What the subsector reads

11.1 The subsector of the subsector spec needs three things from this level for each of eighty hexes: the stars, and nothing else. The counts are already `pbgFor` under 1.6.3, and the main world is already `rollUwp` under 5.1.

11.2 So the star draw of section 2 is a function of the system seed and the main world's profile, separable from the rest of the generation and cheap enough to run eighty times. The subsector calls that and stops; it does not lay out orbits it will never draw.

11.3 The subsector spec 3.7 describes the star draw as the subsector's. It is this level's, and the subsector reads it. The clause stands with that correction — the draw and the weighting it describes are the ones in section 2 here.

11.4 A hex's system is generated in full when the user opens it, and not before. Eighty full systems for a subsector that draws one world each is work nobody asked for.

## 12. Build order

12.1 **The stars.** Section 2, as the separable function of 11.2. It is what the subsector spec's step 8.3 needs, so this level's first piece is the one the level above is already waiting on.

12.2 **Orbits and filling them.** Sections 3 and 4, honouring the PBG contract of 1.6.3. Tested by generating a system and checking its belt and gas giant counts against `pbgFor` for the same seed.

12.3 **The main world in its orbit.** Section 5, including the settings written back under 5.2.2. Tested by the two claims that matter: the profile the system shows equals `rollUwp(worldSeed)` and equals what the subsector drew, and a world saved out of a system carries the orbit the system put it in.

12.4 **The other worlds.** Section 6, including the seam of 6.6 and the tests that pin it down.

12.5 **The diagram and the panel.** Section 8, read only.

12.6 **Overrides, persistence, and navigation.** Section 9, and the joins of the app spec 6.1.

12.7 **Exports.** Section 10.

12.8 Steps 12.1 to 12.4 are the design. Everything after is work.

## 13. Open questions

13.1 **Satellites as main worlds.** Moons are worlds now, under 4.6.1, and a moon with people on it opens like anywhere else. What is still not done is making one *the* main world - the world the subsector draws and the sector line describes - which would mean the hex's profile and its PBG coming from something in orbit around something else. The rest of this document reads the main world as a world of the primary throughout, and that is the work.

13.2 **Worlds in belts.** A belt is a count and a name. Whether individual rocks in one deserve to be places — the mining station, the hideout — is a question about points of interest more than about generation, and the planet spec 6.5 may already be the answer at the wrong scale.

13.3 **Where the companion's own worlds are.** 2.4 keeps every world around the primary and puts the companion outside or inside all of them. A close companion with worlds of its own is a real arrangement and an awkward diagram.

13.4 **Travel times.** The orbits have distances, so the arithmetic for a trip across a system at a given acceleration is available and small. Whether a spec about generation should carry a calculator is a fair question.

13.5 **Seasons, and whether the date should reach a surface.** 3.5.3.1 stops the date at the angles because the planet spec averages sunlight over a whole year, so there is nothing for a day of the year to pick out. A world with a real axial tilt has a summer hemisphere and a winter one, and 3.5 now hands the planet level the one number it would need to say which. It would mean a second temperature model rather than a field, and the ice of the planet spec 5.4.2 would have to move with it, so it is a level's worth of work and not a clause.

13.6 **Whether the date belongs to a planet document too.** A planet carries no orbit to move, so under 9.1 it carries no date, and a world opened on its own is the same world on any day. If 13.5 were ever answered, that changes.

13.7 **Whether secondary worlds should be full planets.** They are, under 6.2, and that is tens of thousands of hexes of surface generated for a rock nobody will land on. The cost is paid only when one is opened, so this is a question about whether the route should exist rather than about performance. Left as it is: a referee who opens an ice moon deserves an ice moon.
