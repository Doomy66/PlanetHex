# Version history

The version in [package.json](package.json) is what the Windows installer of
`npm run package` names itself after, so it is the one number that reaches a
user. Dates are the day the release was tagged.

## 2.2.1 — 2026-09-19

Nothing in the application changed. 2.2.0 and 2.2.1 are the same program, and
there is no reason to install this one over that one.

The release workflow's last step was `gh release create`, which works exactly
once per tag: a release made by hand before the tag was pushed left the run
failing over work it had already finished. It now uploads to a release that is
already there rather than insisting on creating it, and this release is the tag
that proves it.

## 2.2.0 — 2026-09-19

Systems know what day it is. Until now a body sat wherever its seed had put it
and sat there for ever, which made the model a diagram of one arbitrary moment
and the travel times figures with no date attached to them. Every save still
loads and every system opens exactly where it always did: the date a save
without one reads as is the date everything was already drawn at.

- **A Traveller date, on the system view.** `001-1105` in the header, beside
  where the system is. Change it and every body moves round its orbit by however
  much of its own year has gone by, so the inner system turns and the outer
  system barely does. The date is the setting's rather than the system's: one
  value, carried by the subsector and the sector too, and owned by whichever
  level is the top of what is open. `SystemSpec.md` 3.5.
- **Travel times are times on a day.** The panel reads the model, so the run to
  the gas giant is ten hours in one month and three weeks in another, which is
  the true answer and was never available before. `SystemSpec.md` 4.9.4.1.
- **A body's year and the speed it moves at are one number.** The Year row in
  the panel had been worked out from the primary's light while the orbits were
  laid out against both stars'. Both now come off the same figure, so a close
  binary's panel and its diagram agree. `SystemSpec.md` 3.5.2.1.

Nothing about a world's surface moves with the date: sunlight here is averaged
over a whole year, so there are no seasons for a day to fall in. That is written
down as an open question rather than left to be discovered. `SystemSpec.md` 13.5.

## 2.1.0 — 2026-09-17

A tidy of the front of house. 2.0.0 put four levels behind one window and left
the window itself saying things twice, saying them in the wrong place, or asking
for what it already knew. Nothing here changes what is generated: a seed opened
in 2.0.0 opens the same in 2.1.0, and every save file still loads.

- **Renaming a system renames what is named after it.** A body's designation is
  the system's name and its number, so a system called something else now has
  bodies called something else: on the tree, in the panel, and in the worlds
  already worked on and put down. A world the referee named themselves keeps the
  name they gave it. `SystemSpec.md` 7.3.5.
- **Subsector is a field you can fill in, and where you are is owned by the
  level that knows it.** The subsector had been derived from the hex and nothing
  else, which is only ever a letter: what a subsector is *called* is a name, and
  now it is stored and typed like the sector. The letter is still offered as what
  the field shows until you name one. The system view gains the subsector field
  it was missing. And at every level, location is editable exactly when nothing
  above has answered it: a system rolled on its own takes its sector, subsector
  and hex, a system opened from a subsector is told all three, and a subsector in
  a sector is told its sector. `PlanetSpec.md` 6.14.2, `SystemSpec.md` 9.7.
- **The planet panel says where a world is instead of asking.** Opening a world
  out of a system no longer announces its name and its distance to sixteen
  decimal places in the status line: both were already on screen. The location
  fields now read sector, subsector and hex — the subsector had only been a note
  under them — and where a world came down from a system all three are shown
  rather than typed in, because the system is what put it there.
  `PlanetSpec.md` 6.14.2 and 6.14.4, `SystemSpec.md` 6.2.1.
- **The list down the left is dragged to the width you want it.** A body is named
  after its system, so a long system name gave a column of names that wrapped to
  three lines each and showed six bodies at a time. The rows are one line apiece
  now, and the edge of the panel moves: drag it, or focus it and use the arrow
  keys, and the width is remembered. The same edge is on the sector and
  subsector lists. `SystemSpec.md` 8.7.
- **The system header wraps rather than dropping what will not fit.** A narrow
  window had been pushing the seed and the PBG counts off the end of the line
  instead of taking a second one.
- **The word "chart" is gone.** There are four levels and they have names:
  planet, system, subsector, sector. "Chart" meant the subsector almost
  everywhere it appeared and the drawn hex map in the rest, and reading it cost a
  beat every time. Specs, comments, identifiers, CSS class names and three
  filenames all say what they mean now: `src/ui/chart.ts` is
  `src/ui/subsectormap.ts`, `src/chartlayout.ts` is `src/hexlayout.ts`,
  `ChartWorld` is `SubsectorWorld`, and the hex map's classes are `starmap-*`
  rather than colliding with the orbit map's `map-*`. Nothing about what the
  application does has changed.

## 2.0.0 — 2026-09-17

A major number, because PlanetHex was one thing and is now four. Up to 1.5 it
generated a planet. It still does, and the save format has not moved, so a planet
file from 1.5 opens and is the same world. The one thing that reads differently
is a world tidally locked to its star, which is now drawn and described by the
model below rather than by latitude. The planet is now the bottom of a chain that runs
sector, subsector, system, planet, and every level of it generates the same way:
from a seed, with nothing stored that can be derived.

- **Four levels, and one rule holding them together.** A world found on a
  subsector map is the same world opened on its own from its seed. That is the
  whole of it, and it is what makes the levels navigable rather than merely
  stacked: going down never invents anything, going up never loses anything, and a
  seed passed to somebody else reproduces what you were looking at. Each level is
  its own spec — `AppSpec.md` for the chain, then `SystemSpec.md` and
  `SubSectorSpec.md` beside the planet's.
  - **A level bar** at the top of every view, showing which levels are open and
    what each one is called, so the chain is visible from inside it.
  - **A landing page** that says what this is and lets you start at whichever
    level you meant to, rather than at a planet you have to work upwards from.
- **The system level.** A star or two, the orbits they light, and what sits in
  them.
  - **Orbits laid out from the star**, spaced the way the solar system's are, with
    a habitable zone worked out from what the star puts out. Worlds, asteroid
    belts, gas giants and their moons, each rolled from its own seed and wearing
    the main world's social digits where 6.6 says it should.
  - **Drawn twice, because there are two questions.** A schematic strip along the
    foot for what is where in what order, and a model in the middle that is to
    scale in distance, leans, turns and zooms. The main world is marked as the main
    world in both, with the same base and travel-zone marks the subsector above uses.
  - **The star is selectable**, and fills the panel with the system: class and
    size, what it puts out, how wide it is, its jump shadow and how long crossing
    that takes at a gravity, how many orbits sit inside that shadow and so cannot
    jump from where they are, where the habitable zone runs, and the counts of what
    the orbits hold.
  - **Jump shadows**, a hundred diameters from the star and from every gas giant,
    drawn on the model and given as a distance and a time.
  - **Travel times** between any two bodies, at an acceleration you set, given
    both rest to rest and burning the whole way through.
  - **The star can be changed**, and the system is laid out again rather than
    repainted: a different star lights different orbits, so the habitable zone and
    everything beyond it moves. A planet opened from a system carries its star
    with it, and a planet on its own says which star it orbits itself.
- **The subsector level.** Eighty hexes, generated and drawn as a subsector a referee
  can read at a glance.
  - **A standard-looking subsector**: coloured dots sized by population, base and
    zone marks, a key, and no gaps between the hexes.
  - **X-boat routes and trade routes**, under those names and by those rules,
    with **Mains** — the jump-1 connected chains — available as an overlay.
  - **Amber zones that mean something**, two or three to a subsector, each with a
    stated reason, and never on a world nobody lives on.
  - **Density and lean.** How thickly the region is settled, and which way its
    population and tech lean, as modifiers on the dice rather than numbers written
    over the answer. Raising the density only ever adds systems; it never moves
    the ones already there.
  - **The edge is an edge, not an end.** With a sector above it, a subsector shows the
    worlds within two hexes of its border lowlighted, and the routes that cross it.
  - **Exports**: the subsector as a PNG or an SVG, the table as a CSV, a subsector
    sheet in Markdown or HTML, and a Traveller sector file a mapping tool can read.
- **The sector level.** Sixteen subsectors, 32 by 40 hexes, and the two things
  only this level can see: a route that crosses a subsector's border, and a Main
  that runs past one.
  - **Zoom that changes what is drawn.** Out, it is a sector map; going in far
    enough, the hexes fill out into the same detail a subsector map shows.
  - **A subsector you have worked on is the subsector the sector shows**, carrying
    its own density, lean and every hex you wrote on, with the sector's routes and
    Mains worked out again over what is actually there.
  - **Rolling a subsector inside a sector stays inside the sector**: it rolls that
    letter again, in the same slot, wearing the sector's name and lean.
- **Saving: one document per level.** The level you opened is the file, and it
  carries the levels below it that you worked on — a sector file holds the
  subsectors you visited, which hold the systems, which hold the worlds. So there
  is one Save per chain, at the top of it, and moving up a level asks nothing
  because nothing is lost. Each level has its own extension: `.sector`,
  `.subsector`, `.system`, `.planet`, and opening the wrong one at the wrong level
  says so instead of opening something else under the right name.
- **What a child says about itself, the levels above hear.** A world renamed in
  the system view is renamed on the subsector; a subsector renamed is renamed on the
  sector map and in its list. What a parent knows — density, lean, which star,
  which hex, which designation — flows the other way.
- **Physics where the game was arbitrary, and the game's own answer where it was
  not.**
  - **A tidally locked world gets its own temperature model.** Its temperature
    runs from the point under its star to the point opposite, not from equator to
    pole, so it is scorched at one point, frozen over a hemisphere, and habitable
    in a ring between them — and the ice goes on the dark side as one cap rather
    than two. Reading a locked world by latitude described somewhere that does not
    exist on it.
  - **A star's orbits move with the star.** The ladder is held in
    sunlight-equivalent distance and multiplied out by the root of the luminosity,
    because that is what the inverse square law says and what the sky looks like: a
    dim star's system is compact, not a cold copy of the Sun's. Two limits do not
    scale, being nothing to do with light — the Roche limit at the inner end and
    how far a disc of planets reaches at the outer.
  - **The Imperium settled the good stars.** A system with people in it draws a
    star from a different weighting than an empty one, leaning to F, G and K: a red
    dwarf's habitable orbit is inside the reach of its own tides, and nobody put
    three billion people there while a G was going spare. Locked worlds went from
    half a sector to a fifth of the worlds anybody lives on, which is where a
    locked world is worth something. O and B drop to the trace Traveller's own
    table leaves them, and its two blank size columns are honoured, because it is
    right about both.
- **Somewhere to say what it should do instead.** The header links to a new GitHub
  issue with the version, the level and the seed already filled in, because a
  report that names the seed is a report that can be reproduced.
- **It is called a subsector.** Not a subsector, anywhere a user can see.

## 1.5.1 — 2026-09-13

- **A city is drawn as its limits, and nothing else.** Two lines cut from how
  built up the ground is, by the same tracer the contours use: the edge of the town
  and the line inside it where the building closes up, in the colour a city is
  marked in everywhere else. The grey wash that was there before is gone. On a
  small town it read well enough; on a world of billions the city is wider than the
  patch and it turned the whole panel grey, which said only that people lived there
  — true, and useless. Where the edge falls is the thing worth knowing, the terrain
  underneath is left as it was, and two things drawn for one fact was one too many.
  The reach model moved to `gen/settle.ts`, where how far a town is built out
  belongs, leaving `ui/orbital.ts` doing nothing but colour.
  - Drawn in the 3D view as well as the flat one, lying on the ground and
    following it. Contours are dropped in relief because the light already says
    what they say; a town boundary is not something light shows, so there is
    nothing standing in for it there.

## 1.5.0 — 2026-09-13

- **Every hex knows what it is made of.** The orbital view worked out cover,
  weathering, snow and a local temperature for every hex, turned them into a
  colour, and threw them away. A colour is not the answer to the question, so the
  model moved out of the drawing code and into the world model, and now names the
  ground: rainforest, boreal forest, tundra, savannah, steppe, cold desert, bare
  rock, sea ice, snowfield. It is not the terrain band — that says how high the
  ground is, this says what it is — so the readout carries both, and so do the hex
  table and the GeoJSON, in a column of their own rather than in place of the band.
  Two hexes at the same height, one at the equator and one at sixty degrees, are
  the same band and quite different ground.
- **Cities.** A new world arrives with its settlements on it, the way it already
  arrived with its starport.
  - **One per point of the population digit**, the starport counting as the first
    of them. A profile of X has no port, so such a world gets its whole count as
    cities instead.
  - **Sited by habitability**, which is the ground model above asked about people
    rather than plants: food grows where cover grows, a coast beats an inland
    plain, mountains and ice are worth less than either. Each one chosen pushes the
    score down around it, so they spread instead of heaping in the one best bay.
  - **A water world puts its cities on the water**, on the shelf rather than out
    over four kilometres of open ocean. Floating or sunk, the map does not say.
  - **Sized by the rank-size rule**, so the starport is the primate city and the
    rest fall away behind it, and each says what it holds in its own notes. The
    figures are not meant to total the world's population and do not: people live
    on farms, down mines, and on a world with a decent port, in orbit.
  - Ordinary points of interest once placed — move, rename, write up, delete — and
    only New places them. A reroll moves the starport as it always did and leaves
    the cities alone, since the profile names the port and does not name them.
- **A third mark colour**, teal, and one rule for which of the three a hex shows
  when it covers several. The map and the saved picture were deciding that
  separately and now share it.
- **The points of interest list is ordered by kind**, starports first, then
  cities from the capital down, then comments. The kind order is the same ranking
  the marks use: a world carries one port and a dozen other things, and sorting the
  lot by name put the port wherever its letter happened to fall. Within the cities
  it is size, because size is what the list is being read for.
- **A world names its places in one voice.** Five flavours — polyglot, anglic,
  Vilani, founder and functional — and one drawn per planet from the seed, so a
  map does not carry Barreach next to Ishkhuur next to Depot Three. Polyglot is
  the common case: a sector is a thousand years of several languages settling each
  other's worlds, and most of its names are that mixture rather than any one tongue
  kept clean.
- **Cloud on the globe.** How much of it a world carries is the figure the albedo
  was already built on — water to lift and air to lift it into — so a world drawn
  overcast cannot be one the temperature model has been treating as clear. Where it
  sits is the circulation that makes the deserts, read from the other side: heavy
  over the equator, clear over the dry belts at twenty-six degrees, heavy again
  along the storm track of the fifties. A world's deserts lie under its clear skies
  by construction rather than by luck. The rest is noise, because weather is, and it
  does not move: one afternoon, fixed by the seed.
  - Drawn as a translucent shell from a texture rather than hex by hex. A hex is
    what the map is made of and weather is not, and hexagonal cloud would read as a
    fault in the sphere.
  - **Clouds** in the Display section clears it, for when you want the coastline
    rather than the weather. On to start with, since a world has weather. Switching
    it off takes the shell off and leaves it built, so the same sky comes back.
  - Well short of opaque, deliberately. Earth is two thirds under cloud and a
    faithful sky would bury the world; the cover is modelled honestly and only the
    paint is softened.
- **The views are called Survey and Orbital**, and Orbital is what a world opens
  in. They were Terrain and Visible: both views draw terrain, so the first named
  nothing that told it apart, and "visible" reads as a switch for whether a thing
  is shown rather than as a way of drawing it. The new pair says who is looking and
  from where. A world is a place before it is a measurement, so what it opens in is
  what it looks like. The manifest of a save records the new names.
- **Built ground in the local panel.** What people have built is drawn over the
  ground they built it on, in either view, spreading as far as the population
  warrants and thinning into open country at the edge. Only there, and
  it is a question of scale: a hex of the map is sixty thousand square kilometres
  and the largest built-up area on Earth is an eighth of one, so a map drawing it
  would be claiming far more concrete than there is. A local hex is a couple of
  hundred square kilometres and a city covers dozens of them.
- **Editing a digit that bears on settlement places them again**, and so does
  Roll. Starport, size, atmosphere, hydrographics and population all move where
  people would live, so changing one settles the world afresh on the ground the new
  profile makes. Government, law level and tech level do not, and neither does half
  a UWP typed on the way to a whole one. Whatever has been renamed or written on
  comes back with it, which is checkable rather than guessable: a generated name is
  a function of the seed and the rank, and a generated population line a function
  of the size recorded beside it, so anything that differs is the user's.
  - The starport's own reroll rule went with it. It answered the same question for
    one point of interest that this now answers for all of them, and two rules for
    one question is one rule too many.
- **Clicking a point of interest in the local panel opens it** rather than
  starting a blank one on top of it. It holds the name of the lattice it was placed
  on and the patch is drawn on a finer one, so the two names differ for the same
  ground; what makes them one thing is being drawn on the same hex, and that is now
  what the click reports.
- **Choosing something in the list goes to it** rather than opening it for
  editing, and its tooltip now says what the map's does: name, kind, and whatever
  is written on it.
- **A settlement carries its size as a number** as well as in its notes. The line
  is the referee's to rewrite; the number is what the list sorts by, and reading an
  order back out of prose anyone can edit would stop working the first time they
  did. It survives an edit and a move, being no part of the form.
- Open questions 8.2 and 8.3 closed.

## 1.4.0 — 2026-09-12

- **An Orbital view.** Beside the height ramp, a second way to colour the world:
  what an eye in orbit would see rather than how high the ground is. Green where
  things grow, brown where the ground is bare but weathered, grey where it is bare
  rock, white where water is frozen, and a darker sea than the map's. All three
  panels draw it, and so do the saved pictures and the coloured exports, with the
  manifest recording which view wrote them.
  - **It reads temperature where the terrain ramp reads height.** The verdancy
    that decided one colour for a whole world is now read a latitude at a time, so
    a temperate world is jungle at its equator and tundra at sixty degrees.
  - **Axial tilt sets how far apart those latitudes are.** Annual sunlight falls
    off towards the poles by a factor that is full on an untilted world, nothing at
    54.7 degrees, and negative past it — the same fact the ice caps are already
    built on. So a world lying on its side comes out iced at its waist and green at
    its ends. Thick air rubs the difference out: Venus is within a degree or two of
    itself pole to pole, an airless world swings the whole way. Calibrated to
    Earth, whose 23 degrees at one atmosphere give 30C at the equator and -18C at
    the poles.
  - **Brown or grey is about weather, not life.** A trace of air is enough to
    oxidise a surface over four billion years, which is why Mars is red and Luna is
    grey. A trace of water is not: a hydrographics digit of 0 leaves a rock a rock.
  - **Dry belts in the subtropics**, because air that rose over the equator comes
    down about 26 degrees out having already rained, and a world drawn without them
    has a green waist no planet has.
  - **Snow by local temperature**, permanent snow rather than snow that falls: the
    line runs from the water's edge on ground averaging -15C to the summits alone
    at 27C.
- **The left panel folds.** Four sections — Profile, Display, World, Narrative —
  so the part being worked on can be on screen with the points of interest under
  it. The world settings start folded; the rest start open.
- **The selection survives a coarser map.** Three hex names in four have nowhere
  to go at level 12, and moving the slider down used to empty the selection and
  blank the local panel with it. The ground has not gone anywhere, so the selection
  moves to the hex covering it, and the name the user picked is held rather than
  overwritten: the way back up the slider lands on their hex, not on the middle of
  the one that stood in for it.

## 1.3.0 — 2026-09-12

- **Craters.** Impacts are laid over the height field as a layer of their own
  rather than folded into the subdivision that makes the ground, because a crater
  is not a scale of terrain but an event at a place. The map, the globe and the
  local panel all add the same function of position, so it is the same crater on
  all three, and a hex still reads the same height at every detail level.
  - **How many a world kept** is rolled from its seed and then scaled by the same
    erosion figure that rounds off its ridges. An airless waterless rock keeps its
    whole record; a world with a standard atmosphere and oceans keeps none. The
    ceiling is a band rather than a figure, since two airless rocks with the same
    profile have not been hit the same number of times and no digit of the profile
    says which.
  - **The count is a world setting**, beside axial tilt, day, orbit and mean
    temperature. Type over it, or empty the field to put the rolled figure back.
    A typed zero is a different thing from an empty field: it is a referee saying
    this world's record has been wiped whatever its air and water work out to. The
    line under it says how much ground is inside a rim, and what the seed rolls
    once you have moved away from it. Saves carry the setting; a file written
    before it existed loads on its rolled count.
  - **Sea level is read with the craters already on it**, so a flooded basin is
    sea and the coastline answers to the surface actually drawn.
  - The world sheet lists the count with the other world settings.

## 1.2.0 — 2026-09-11

- **Save now asks what to write.** A dialogue lists the map images, one line per
  detail level, and the export formats below, with a line under each saying who
  would want it. The planet's own JSON is not among them: a save without it is
  not a save. What you tick is remembered between sessions, and the dialogue
  says how many files it is about to write before it starts, since the finest
  levels take a few seconds each.
- **Seven export formats**, for the tools that are not PlanetHex. A picture of a
  map cannot be queried, projected, styled, or put on a subsector, and until now a
  picture was all a save could hand over.
  - **Vector map (SVG)** — the hex map as lines rather than pixels, from the same
    detached renderer the pictures come from.
  - **Equirectangular plate and heightmap (PNG)** — the world drawn again with
    longitude across and latitude down, pixel by pixel off the surface rather
    than hex by hex, so the coastline is the one the world actually has. The grey
    heightmap beside it runs from the lowest a world can go to the highest, so
    two worlds can be read against each other.
  - **Virtual tabletop scene (PNG)** — the map at a hundred pixels to the hex,
    the size a Foundry or Roll20 scene starts at.
  - **Hex polygons (GeoJSON)** — every hex as a shape in latitude and longitude
    with its height and terrain, and every point of interest as its own point. A
    hex on the antimeridian is written as one ring rather than a shape stretched
    round the world, and the two pole hexes are closed over the pole.
  - **Hex table (CSV)** — the same again for a spreadsheet or a script.
  - **Traveller sector line** — the world as one tab separated line with its
    trade codes worked out, ready to paste into a sector file. Bases, zone and
    stars are left blank, since PlanetHex describes the world and not the system;
    PBG is rolled from the seed.
  - **World sheet (Markdown and HTML)** — one page with the profile spelled out
    position by position, the worked figures, the narrative, and every point of
    interest by name and by hex. The HTML carries its own styling and prints.
- A small `-export.json` goes in beside them holding what a picture cannot say
  for itself: which world it is, how many kilometres a hex covers, and which
  shade of grey the heightmap puts sea level at.
- A save no longer stalls when the tab is put in the background. The pauses that
  let the progress message reach the screen waited on an animation frame, and a
  browser gives none to a tab nobody is looking at.

## 1.1.0 — 2026-09-11

- **Contour lines over the local detail panel**, off until asked for by the
  switch beside the panel's heading. The colours say what height the ground is;
  the lines say how fast it changes, which is the thing a walking map is read
  for. Each runs along the sides between the hexes it separates, counted from
  sea level so one line always lies on the coast, and spaced at whatever round
  interval suits the ground in view. The interval is given under the scale bar.
- While the lines are on, the seams between the hexes give way to them, so the
  contours are the only lines on the patch. Switched off, the panel is drawn
  exactly as it was.
- **The globe is always drawn at the finest detail level**, whatever the Detail
  slider is set to. It is a picture of the world rather than of the hex map, and
  at the coarser levels a single hex covered a swathe of the sphere. Its grid is
  built once and its heights are read off the same field the map was sampled
  from, so the panel it feeds shows four times the detail without the world
  taking longer to generate.
- Sea level and the heights on screen now come off one height field instead of
  one each. That was the same expensive work done twice on every redraw, and it
  is what paid for the globe above.
- **A fifth detail level: 96 rows, 92162 hexes.** Twice as fine as the old
  finest, which puts a hex at a few tens of kilometres across on an Earth
  sized world. It costs about a second to draw, where the other levels are a
  fraction of one.
- The globe draws at that level too, so its coastlines are as fine as the map's.
  Four times the hexes costs about a sixth of a second on a redraw, taking one
  from roughly 0.57s to 0.74s, since the mesh is only a part of what a redraw
  does. The lattice sea level is measured on keeps its own coarser level, since a
  quantile gains nothing from four times the samples.
- **A Smooth switch beside the Detail slider**, which draws the ground without
  the seams between its hexes. At the fine levels a seam is thinner than a pixel,
  which cannot be drawn and is spread instead, so the finest level arrives as a
  grey haze of its own hex edges rather than as a map. Which of the two the reader
  wants is now asked rather than guessed at. Selection and point of interest rings
  are floored at something visible and drawn either way, and the saved pictures
  follow the switch.
- Hex names count on the new finest lattice, so every one of them has doubled:
  the hex that was `F07R33C08` is now `F07R66C16`. It is the same hex, named on a
  lattice twice as fine. Saved planets are unaffected - a point of interest
  carries the lattice it was placed on, and a save old enough to carry none is
  read on the 48 row lattice those files were written on - but a hex name written
  down by hand, or typed into a narrative, now names somewhere else.
- The height field is kept between redraws instead of being rebuilt each time.
  It depends on the seed and the two knobs the UWP sets and on nothing else, so
  moving the slider, leaning the axis or drying the world out was rebuilding a
  field that had just been built. This is what 3.2.4.3 already said the cost
  was. Levels 6 to 48 now redraw faster than they did before the fifth level
  was added.

- **A lit 3d view of the local patch**, on a switch beside the panel's heading
  next to the contours one. The same ground seen from thirty degrees above and
  lit by a low sun: a block of land with the sea filled in at its own level and
  cut earth down the sides. The surface runs smoothly through the same heights
  the hexes are coloured from, since a hillside is not made of hexagons. The
  flat view is the hex map; this is the country it stands for.
- Height in that view is exaggerated by a fixed amount rather than stretched to
  fill the panel, so gentle ground reads as gentle ground and two patches of one
  world can be compared. Distance across the panel stays true, which is why the
  scale bar stands in it unchanged.
- Points of interest are marked and named in the 3d view but cannot be placed
  there, and the contours switch greys out while it is on.
- The local panel's scale bar stands in the bottom left corner of the panel,
  under the hex readout in the top left, rather than floating in from the edge
  by however much the patch's shape differed from the panel's.

## 1.0.1 — 2026-09-06

- **Saving and loading no longer need Chromium.** The File System Access API is
  still used where it exists, because writing a folder in place and rewriting it
  on the next Save is the better behaviour. Where it is missing the same five
  files — the planet's JSON and the map at each of the four detail levels —
  arrive as a single zip download instead, and Load accepts either that zip or
  the JSON inside it. Firefox and Safari can now run the application in full.
- The status line says which of the two paths is in use, rather than the
  application failing at the moment the user clicks Save.
- README documents the two save paths, what publishing `dist/` to a static host
  involves, and the Traveller SRD and trademark position.

## 1.0.0 — 2026-09-02

- **The desktop build installs itself** rather than unpacking the whole
  application on every launch, which is what made the first start slow.
- First release considered finished rather than in progress.

## 0.2.0 — 2026-09-02

- The starport moves when the world is rerolled, instead of staying on a hex
  that the new surface may have put under water.
- The window closes when asked. Embedded Chromium has no `Leave site?` dialog of
  its own, so the shell now answers `beforeunload` itself.

## 0.1.0 — 2026-09-02

Initial release. One world seen two ways at once — the flat hex map on the
icosahedral net and the turning globe — at four detail levels, driven by a UWP
rolled to Traveller's world creation rules and editable digit by digit.
