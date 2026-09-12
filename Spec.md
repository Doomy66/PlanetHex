# PlanetHex

A browser application that generates planet surfaces procedurally and shows them two ways at once: as a flat Traveller-style hex map, and as a rotating sphere.

## Contents

1. [Purpose](#1-purpose)
2. [Map grid](#2-map-grid)
3. [Height generation](#3-height-generation)
4. [Display](#4-display)
5. [Colouring](#5-colouring)
6. [Planet data and persistence](#6-planet-data-and-persistence)
7. [Reference images](#7-reference-images)
8. [Open questions](#8-open-questions)

---

## 1. Purpose

1.1 The application generates planet surfaces and displays them as a hex map suitable for the Traveller TTRPG, and as a sphere that can be rotated and zoomed.

1.1.1 The application uses Traveller's terms and formats where they are the clearest way to describe what it does. It does not reproduce the game's text, tables, artwork, or forms, and does not need them to work.

1.2 The height of each hex is generated procedurally from a seed unique to each planet.

1.3 The same seed always produces the same planet. Nothing about the surface is stored except the seed and the planet's settings, so a planet can be shared as a short string of text.

1.4 The flat map and the sphere show one planet, not two views generated separately. Both read the same height values.

## 2. Map grid

### 2.1 Icosahedral net

2.1.1 The surface is divided into the 20 triangular faces of an icosahedron, and each face is tiled with hexagons. This is the scheme used by both reference images in section 7.

2.1.2 The flat map draws the 20 faces unfolded into the standard zigzag strip: an upper row of downward triangles, a lower row of upward triangles, meeting along the equator.

2.1.3 Hexes that straddle a face edge are single hexes shared by both faces. Splitting one into two half hexes at the seam is wrong, and it will show up as a visible crack when the net wraps onto the sphere.

2.1.4 The 12 icosahedron vertices are the awkward positions. A hex centred on a vertex has 5 neighbours rather than 6. The code must treat 5 as valid everywhere it walks neighbours.

### 2.2 Detail

2.2.1 The detail level is a planet setting: the number of lattice rows across a face. A grid of n rows has 10n² + 2 hexes in total.

2.2.1.1 That count follows from 2.1.3 rather than being chosen. Once hexes on a shared edge belong to both faces, and the twelve corner hexes belong to five faces each, a face no longer owns a whole number of hexes, so 20 × something is not available. The reference form's 500 is a count of drawn cells on a flat sheet, not of distinct hexes on a closed surface.

2.2.1.2 The default is 24 rows, giving 5762 hexes. It is the default rather than the finest because it is the level the map is worked on at, and 2.2.2.5 is what the finest level costs.

2.2.2 Five levels are offered rather than a free choice of row count: 6, 12, 24, 48, and 96, giving 362, 1442, 5762, 23042, and 92162 hexes. They sit on a slider in the left panel, labelled Detail.

2.2.2.1 The five are a doubling chain, so each one divides every larger one. That is what 2.4 needs, and it is the only reason the set is closed. A free row count would leave most pairs of levels on lattices with nothing in common beyond the twelve corners, and a hex would then have no name that survived a change of level.

2.2.2.2 The control is called Detail rather than Size or Zoom. Size reads as the size of the planet, which is the UWP's business under 6.12. Zoom reads as magnification, which is the one thing this is not: under 3.2.4 a finer level resolves detail already present in the field rather than enlarging what is on screen, and 4.5.2 turns on the same distinction.

2.2.2.3 The word detail is already doing two other jobs here: the detail values of 6.12, and the local detail panel of 4.5. This one is written detail level throughout, and the other two are never shortened to it.

2.2.2.4 The slider is the map's. The sphere of 4.4.9 stands outside it at a level of its own, and the local detail panel follows it at a fixed distance below under 4.5.6.

2.2.2.5 The finest level is the one the set is open at the top for, and it is the only one that costs anything to reach: around a second to draw where the others are a fraction of one, on ninety thousand hexes drawn a pixel wide. It earns that by being the level at which a hex is a piece of country rather than a region - a few tens of kilometres across on an Earth - and by being where 4.3.6 has something worth zooming into. The panels that are not the map are not asked to pay it: the sphere keeps its own level under 4.4.9, and what sea level is measured on keeps its own under 5.2.4.1.

2.2.3 Hex scale in miles or kilometres follows from the planet radius and the hex count, and is shown rather than entered. At the default level on an Earth sized world, that is roughly 430 miles per hex.

### 2.3 Coordinates

2.3.1 Every hex has a stable identity of the form (face, row, column) so a hex can be named in a save file, in a URL, and at the table during play. Which row and column, once there is more than one detail level to count them on, is settled in 2.4.

2.3.2 Every hex also has a position on the unit sphere, used for rendering the globe and for any latitude dependent behaviour.

2.3.3 Neighbour lookup crosses face boundaries. A generation pass that stops at face edges will produce 20 disconnected patches instead of one planet.

### 2.4 Cell identity across detail levels

2.4.1 A hex has one name, and it is the same name at every detail level that draws it. This is the identity 2.3.1 calls for, and it is what a save file, a URL, and a player at the table hold.

2.4.2 The id a hex carries inside a built grid is the index it was handed while that grid was built. It is not a name. It does not survive a change of detail level, it does not survive a change to the build order, and it appears neither in a save file nor on screen.

2.4.3 A lattice point is placed by the ratios i/n and j/n rather than by i and j on their own, so multiplying the whole triple by a whole number lands on the identical direction. (face, i, j) on a lattice of n rows is (face, ki, kj) on a lattice of kn rows: the same point exactly, not one within a tolerance of it.

2.4.4 So a hex is named by its (face, i, j) on the lattice of the finest level, currently 48. Every level of 2.2.2 divides that level, so every hex of every level has such a name, and two levels that both draw a hex give it the same one. The written form is F07R33C08.

2.4.5 A hex on a face edge has a coordinate on both faces, and one at an icosahedron corner has five. The lowest numbered face wins. Which of them wins does not matter; that the same one wins every time does, because this is what gets written down.

2.4.6 Read the other way, a name lands on a level only where that level's lattice reaches it. Three names in four have nowhere to go at level 12, and none at level 6 but the twelve corners. The honest answer there is that the level does not draw that hex, not the nearest hex it does draw. Snapping to a neighbour would move something the user placed, and then move it somewhere else again on the way back.

2.4.6.1 That is about the name, and it holds. A point of interest keeps the name it was placed on and is drawn wherever the level can draw it, never moved onto a neighbour. The selection of 2.4.7 is the one thing read the other way round, because a selection is not something written down: it is where the user is looking.

2.4.7 The selection follows the name. Selecting a hex and then moving the slider keeps the selection on that hex at every level that draws it, rather than landing on whatever hex inherited the old index.

2.4.7.1 A level that does not draw the hex selects the hex covering the same ground. Under 2.4.6 three names in four have nowhere to go at level 12, and coarsening the map used to empty the selection and blank the local panel with it. The ground has not gone anywhere, though, and the coarse level is drawing it in some hex of its own, so that is the hex the selection moves to.

2.4.7.2 The name is not overwritten with the covering hex's own. It is held exactly as the user picked it, so the way back up the slider lands on the hex they chose rather than on the middle of the one that stood in for it.

2.4.8 A point finer than the reference lattice is named the same way, with the depth carried alongside: (face, i, j) counted on a lattice of that many rows. The local panel of 4.5 draws hexes far finer than the reference lattice, and a point of interest can sit on one of them, so those hexes need names too.

2.4.8.1 The triple is held in lowest terms. Under 2.4.3 the same point counted on two lattices is one point, so reducing it means one point has one name whatever depth it was reached at, and two names that look different are two different points.

2.4.8.2 The written form is the hex name of 2.4.5 where the point is one of the reference lattice, and that name followed by a slash and the depth where it is finer. Without the depth the numbers say nothing.

## 3. Height generation

### 3.1 Seed hexes

3.1.1 Generation starts by assigning a random height to a small number of fixed hexes. The poles are the obvious candidates, and the 12 icosahedron vertices are the natural set, since they are evenly spaced and already special in the grid.

3.1.2 The set of fixed starting hexes may change to suit whichever subdivision process is used. What matters is that they are chosen the same way every time for a given seed.

### 3.2 Subdivision

3.2.1 Heights live on their own nested lattice rather than on the display grid. Level 0 is the twelve starting hexes of 3.1. Each later level halves the spacing, and every point a level introduces sits at the midpoint of an edge from the level before.

3.2.2 A new point takes the average of the two ends of the edge it bisects, plus or minus a random offset. Those two ends are its parents, which is what 3.2.1 leaves no room to argue about.

3.2.3 The offset shrinks with each level, so early levels set continents and later ones set local roughness.

3.2.4 The display grid samples the field, and the field is built to the same depth at every detail level: deep enough for the finest level of 2.2.2. The detail level therefore decides how finely the world is read and decides nothing else. A coarser level draws fewer hexes. It does not draw a smoother world, and it does not draw a different one.

3.2.4.1 This is what makes the slider safe to move. Building the field only as deep as the level in use would mean a coarse map ran on a field whose later levels had never been applied, so raising the level would add detail by rewriting the heights already on screen. Every hex would shift, coastlines included, and the user would have no way to tell a finer view of their world from a different world. Fixing the depth removes the question rather than answering it.

3.2.4.2 The concern behind the earlier arrangement is still real and is still met. A coarse level is not an interpolation of a coarse field; it is a sparse reading of the full one. The fine detail is in the field either way and simply has no hex to appear in, so raising the level reveals it rather than inventing it. That is the relationship the local panel already has with the field under 4.5.2, applied to the map.

3.2.4.3 The cost is that the coarsest level pays for the finest level's field. It is a fixed cost, paid when the seed or the knobs of 3.4 change rather than when the slider moves, and it does not grow with the level the user picked.

3.2.5 Heights are clamped to a fixed range so the colour ramp in section 5 always maps the same way. Clamping happens once at the end. Clipping a value mid-subdivision would feed the clipped figure into later averages and drag the surface upward around deep ocean.

### 3.3 Determinism

3.3.1 All randomness comes from the planet seed through a seeded generator. The browser's default random number source is not used anywhere in generation.

3.3.2 Generating twice from one seed and detail level gives identical heights, in the same session or in a different browser.

3.3.3 A point's random offset is fixed by the seed and by where the point is, not by the order in which points are visited or by which face reached it first. So the twenty faces agree along every seam, and each level agrees with the one before it.

3.3.4 The seed fixes where the continents are. Changing the detail level resolves the same continents more finely rather than producing a different planet. Under 3.2.4 that now holds hex by hex rather than only in outline: a hex drawn at two levels carries the same height at both, to the last bit and not to a tolerance, and the twelve level 0 heights do not move at all.

### 3.4 What the UWP shapes

3.4.1 The seed says which world this is. The UWP says what kind of world it is, and the two together make the surface. The world settings of 6.15 sit between them: rolled from the seed and the profile, then the user's to overrule, and read here on the same terms as a digit. It sets the height field's knobs; it never supplies a height.

3.4.2 Gravity, from the size digit under 6.12, sets the relief. A heavy world cannot hold up tall ground and comes out subdued; a light one keeps mountains far larger in proportion, which is why the tallest peaks in the solar system stand on small bodies.

3.4.3 Pressure and surface water, from the atmosphere and hydrographics digits, set how much fine detail survives. Both erode, counting equally, so a thick wet world is weathered and rounded and an airless dry one keeps its edges.

3.4.3.1 How hard the air bites depends on what it is made of as well as how much of it there is. A corrosive atmosphere attacks rock a standard one at the same pressure would barely touch, and an insidious one is worse again. Only the chemistry counts: the tainted types differ from their clean partners in what they do to lungs rather than to rock, so they weather the same, and exotic is unusual rather than aggressive.

3.4.3.2 Air erosion reaches full strength at the pressure the very dense band begins, not at a standard atmosphere. Saturating earlier would make every thick world weather identically and leave 3.4.3.1 with nothing to show.

3.4.3.3 What the water is doing to the rock depends on what state it is in, which is the temperature's business and not the hydrographics digit's. That is 6.15.9, and it is why an ocean world can come out unweathered: frozen to the bottom, or boiled away.

3.4.3.4 How hard the air blows is the rotation's, under 6.15.10, as well as how much of it there is and what it is made of.

3.4.4 Continent spread stays with the seed. It is a matter of which world this is rather than what kind, so no digit touches it.

3.4.5 An unreadable UWP leaves every knob at its default, so the surface is still generated rather than blank.

3.4.6 Editing a digit rebuilds the heights but not the hex grid, which depends only on the detail level of 2.2.1.

### 3.5 Depth beyond the display grid

3.5.1 The field can be evaluated at any depth without being built at that depth. A point's height depends only on its two parents, so a point far below the display grid's level can be worked out by following that chain upward and computing nothing else. Building every point at such a level is not possible; each level quadruples the work.

3.5.2 A point evaluated this way and the same point in a built field carry the same height. It is the same recurrence, keyed by position in the same way, so the two agree at every point they share and the local view of 4.5 cannot drift from the map.

3.5.3 Lattice points beyond the edge of a face belong to the neighbouring face. A point is turned into a direction and the direction says which face holds it, which settles all thirty seams without a rule for each. At the twelve corners five faces meet and the lattice cannot continue straight; the point nearest the direction is used, so the patch stays whole rather than tearing.

### 3.6 Craters

3.6.1 Impacts are a second layer over the field of 3.2, added to a height after the field has been sampled rather than folded into the recurrence that produces it. A crater is not a scale of terrain but an event at a place: a circle of a definite size dropped on whatever was already there, and the subdivision has no way to say that. The map, the globe and the local panel all add the same function of position, so a crater is the same crater on all three.

3.6.1.1 Keeping the layer separate is what leaves 3.2.4 and 3.3.4 untouched. The field is still the field; a hex drawn at two detail levels still reads the same height at both, because the crater layer is a function of the direction the hex sits in and not of the lattice it was counted on.

3.6.2 How many impacts a world carries comes off the erosion figure of 3.4.3. Every world has been hit about as often for its size; what differs is whether the scars survived, and air and water are what remove them. An airless waterless rock keeps its whole record. A world with a standard atmosphere and oceans keeps none worth drawing, and the same figure that rounds off its ridges fills in its craters.

3.6.2.1 How full a full record is, is drawn from the seed rather than fixed. Two airless rocks with the same profile have not been hit the same number of times: one sat in a crowded part of a young system and one did not, and no digit of the UWP speaks to that. So the ceiling is a band the seed draws from, and the erosion figure scales whatever it drew. It is a world setting under 6.15.12, so a referee who wants a particular surface can say so.

3.6.3 Sizes follow a power law: the number of craters wider than a given size goes as the inverse square of that size, which is about what a real cratered surface counts out at. The largest is cut off so a world is not one basin, and the smallest is cut off where the finest map stops resolving a circle, since a crater below a hex across reads as noise rather than as a crater.

3.6.4 A crater is a parabolic bowl to its rim, a lip that rises only near the rim so the floor is not raised by it, and an ejecta blanket outside that thins to nothing. Depth grows with width but more slowly, and stops at a ceiling: past a few degrees a real crater floor collapses back on itself, and without the ceiling the largest basin would punch through the range the colours of section 5 are drawn over. Depth is scaled by the same relief the gravity of 3.4.2 sets, so a crater stays in proportion to the ground it was dug out of.

3.6.5 Sea level of 5.2 is read off the reference lattice with the craters already on it, so a flooded basin is sea and the coastline answers to the surface actually drawn.

3.6.6 Impacts are filed on a coarse lattice of their own, eight rows to a face, and a hex tests only the impacts filed under the bucket it falls in. Every sample already knows its face and its place on that face's lattice, so the bucket costs two divisions and no search, and most of a world is ground nothing landed on and leaves without touching a crater at all. A thousand craters cost around ten milliseconds on a full redraw at the finest level, against the six hundred that level already spends drawing its hexes.

## 4. Display

### 4.1 General

4.1.1 The application runs in a browser.

4.1.2 The window is three panels side by side, described below.

4.1.3 The three panels stay in sync. Selecting a hex, editing a property, or regenerating updates all of them at once.

### 4.2 Left panel

4.2.1 Holds what the user can edit and nothing else: name, location, seed, UWP, narrative text, the world settings of 6.15, and the other settings of 6.1. Generated values live in the panels that show what they produced, so nothing on this panel is read only and nothing off it can be typed into.

4.2.1.1 The world settings are the awkward case, because they arrive generated and can then be overruled. They are here rather than on the summary panel because what decides which panel a value belongs to is whether the user can change it, not where its first value came from. A rolled figure the user may type over is theirs; a figure read off the digits is not.

4.2.1.2 A setting the user has overruled is marked, and a Reset beside the heading hands the lot back to the roll. Without that there is no way to tell a figure that was decided from one that merely came up, and no way back once one has been typed over.

4.2.2 The selected hex's properties are shown by 4.5.6 rather than here, so they sit beside the hex they describe instead of across the window from it.

4.2.3 Holds the New, Save, and Load buttons.

4.2.6 The panel is a name and then four sections that fold: Profile, holding sector, hex, UWP and seed; Display, holding the detail level, the seams of 4.3.7 and the view of 5.7; World, holding the settings of 6.15; and Narrative.

4.2.6.1 Sections rather than one long column because the panel outgrew the window. A user working on the terrain has finished with the sector and the hex, and a user writing up a world is not moving the detail slider; folding away what is settled is what lets the part being worked on be on screen with the points of interest under it.

4.2.6.2 The world settings start folded and the rest start open. They are the only section that arrives with every field already filled in correctly, so they are the section a user is least often opening. The reset of 4.2.1.2 stays in the heading, and a click on it resets the world rather than folding the section away.

### 4.7 Summary panel

4.7.1 Under the flat map, a panel of everything generated about the planet that the user cannot change: the detail values of 6.12 in a single column, with the description of 6.13 beside them to the right. The world settings of 6.15 are not here, for the reason 4.2.1.1 gives, but the description reads them.

4.7.1.1 Where the window is too narrow to carry both, the description drops below the values rather than being squeezed into a column one word wide.

4.7.2 Nothing here can be edited. It is the counterpart to 4.2.1, and the pair of them divide the planet into what the user writes and what the application works out.

4.7.3 It updates as the UWP is edited, since everything on it is read off the profile.

4.7.4 A population runs to sixteen digits at the top of its scale, which no column holds and no reader takes in. The figure is given as prose, and the exact number is kept for the title, so precision is available without the column being unreadable.

4.2.4 Editing the seed or the detail level regenerates the planet. Editing the name does not.

### 4.3 Middle panel

4.3.1 Shows the flattened hex map as the unfolded icosahedral net.

4.3.2 Clicking a hex selects it and shows its properties in the left panel.

4.3.3 The selected hex is marked clearly enough to find again after panning.

4.3.4 A hex carrying a point of interest, or covering one under 6.6.1, is ringed in the colour of its kind, from 5.5.1.

4.3.4.1 The ring is drawn in the seam the hexes already leave between them, at the width of that seam. A mark says what is on a hex, so it cannot cover the hex and hide the ground it is about, and it cannot spread onto the hexes around it either, or it would be saying something about them too. The gap between hexes is the one place on the map that belongs to neither, which is what makes it the right place to draw in.

4.3.4.2 A ring grown outside the hex instead reads as a blob at the sizes a hex is actually drawn at: at level 48 a hex is a few pixels, and half as much again in every direction is a mark several times the area of the thing it marks.

4.3.4.3 The selection of 4.3.3 is drawn the same way and in the same seam, over the marks. On a hex that is both, the selection is what shows; what is on the hex is then read from the tooltip of 4.3.5, from the readout of 4.5.6, and from the list of 6.5.7, which is where the detail belongs anyway.

4.3.5 Resting the pointer on such a hex shows what is on it as a tooltip: for each point of interest, its name, its kind, and its narrative. The tooltip follows the pointer, and it is the only place the narrative is shown in full, since a map has no room to write prose on a hex. A hex without one shows nothing, rather than an empty box.

4.3.5.1 Everything the hex covers is listed, not the first with the rest as a count. A hex covering several is exactly the case where the user cannot tell what is there by looking, so it is the case where naming one and counting the others answers the wrong question.

4.3.6 The map can be zoomed and panned. At the fine levels a hex is a pixel or two across, which is enough to colour the world and not enough to work on it, so the panel has to be able to show a part of the net at a usable size.

4.3.6.1 Zooming holds whatever is under the pointer under the pointer, so the map moves towards what the user is looking at rather than towards its own middle.

4.3.6.2 Zooming out stops where the whole net fits the panel. There is nothing further out to show: the net is the whole world, and pulling back past it only shrinks the world inside a panel it already fits. Panning is held inside the same bounds, so the map cannot be pushed off the edge and leave the panel empty.

4.3.6.3 A drag is not a click, as 4.4.4 has it for the globe, so moving the map does not change the selection.

4.3.6.4 The view survives a change of detail level. The net is the same size at every level, so a view taken over one part of the world still means that part of the world when the hexes under it are redrawn finer. New and Load put it back to the whole net, for the reason 4.4.5.2 puts the camera back.

4.3.7 A hex is drawn with a seam between it and its neighbours, a fixed fraction of the distance between two hex centres, so the seams hold their proportion at every level rather than swallowing the fill at the fine ones.

4.3.7.1 A switch beside the slider, Smooth, draws the ground without them. At the fine levels a seam is thinner than a pixel, which cannot be drawn: it is spread instead, and a map of hexes too small to make out becomes a grey haze of their own edges rather than a picture of a world. Which of those the reader wants is not for the panel to decide - the hexes are the thing the map is for, and they are also the thing in the way of seeing the ground - so it is asked rather than guessed at.

4.3.7.1.1 The switch sits with the detail slider rather than with the panel, because what it is worth depends on the level: at level 6 a seam is a clean line around a hex you could work on, and at level 96 it is a fraction of a pixel over a hex you cannot see. It is a view of the world and not part of it, so it is not saved with the planet, and it changes a width rather than a shape: the map already drawn answers to it without being built again.

4.3.7.1.2 The pictures of 6.4.5 are written the way the panel is drawing. They are wider than any panel, so their hexes are larger than the ones on screen and a level can carry a seam there that it cannot carry here, but whether the reader asked for seams at all is the same answer in both.

4.3.7.2 A mark is floored rather than following the seams. The selection of 4.3.3 and the rings of 4.3.4 are drawn at the seam's width or at something visible, whichever is larger, and they are drawn whether the seams are or not: a seam nobody can see costs nothing, and a selection nobody can see is a panel that will not say what is selected.

### 4.4 Right panel

4.4.1 Shows the planet as a sphere, coloured to match the hex map.

4.4.2 The planet rotates slowly on its own.

4.4.3 The user can rotate and zoom it. Dragging takes over from the automatic spin, which picks up again once the user has been still for a moment, so the panel does not sit frozen after one nudge.

4.4.4 Selecting a hex in the middle panel marks the same hex on the sphere, and clicking a hex on the sphere selects it in the other two panels. A drag is not a click, so turning the planet does not change the selection.

4.4.5 The sphere is drawn at a radius the diameter of 6.12 sets, so how big the world is can be seen before any number is read. A size A world fills the panel and a size 0 world is drawn at about a quarter of that. The scale is a straight line between those two, taken from the diameter rather than the digit, so the detail value within a digit moves it as well.

4.4.5.1 A quarter is a floor rather than the honest proportion. A size 0 world beside a size A one is under a sixteenth of it, and at that size the panel would be showing a dot. The reading wanted here is small against large, which the floor keeps.

4.4.5.2 Size is carried by the sphere and not by the camera, so zooming and turning work the same whatever the world's size, and how close the user can get is measured from the surface rather than from the centre. New and Load put the camera back where it started, since a view left zoomed in on the last planet would contradict what the size of the next one is saying. Nothing else moves it: editing the size digit changes the world in view rather than the view.

4.4.6 An unreadable UWP has no diameter, so the sphere is drawn at full size rather than at a guessed one, matching 4.6.4 where the scale bars show nothing.

4.4.7 The sphere is drawn leaning by the axial tilt of 6.12.3, so how the world's seasons work can be seen alongside how big it is. An untilted world stands upright; one near 90° lies on its side.

4.4.7.1 The lean is towards the side of the panel rather than towards the viewer. Leaning away from the camera would foreshorten the whole of it, and a world of Earth's tilt would read as upright.

4.4.7.2 The tilt is what the ice caps of 5.4.2 are already computed from, so the pole the sphere leans over is the pole whose cap the tilt has narrowed. The panel shows one fact rather than two.

4.4.7.3 The spin of 4.4.2 turns the world about that axis. It used to walk the camera around the world instead, which looks the same only while the axis is upright: with a tilt, an orbiting camera swings the pole from one edge of the sphere to the other and the world reads as wobbling rather than turning. The axis holds still and the world turns under it.

4.4.7.4 A line through the poles is drawn along the axis, so the lean can be read on a world whose surface gives no clue where its poles are. It stands out past the surface at both ends and is hidden where it passes behind, which is what makes it read as an axis through the world rather than a stroke across the picture of one. The northern end is the longer, so which pole is which can be told without turning the globe.

4.4.7.5 The line holds still while the world turns, for the same reason the axis does under 4.4.7.3. A line that spun with the surface would be a line drawn on the world rather than the axis it turns about.

4.4.8 A hex carrying a point of interest is ringed on the sphere in the colour of its kind, from 5.5.1, so where the places on a world are can be seen on the globe as well as on the map.

4.4.8.1 A ring rather than the filled patch the selection is drawn as. The two mean different things and a hex can be both, so they are told apart by shape as well as by colour.

4.4.8.2 The rings turn with the surface, since they are drawn on the ground rather than over the picture of it, and a ring on the far side of the world is hidden by the world. The selection is not: it is the one thing the user is looking for, and hiding it would leave them turning the globe to find out where it went.

4.4.9 The sphere is drawn at a fixed level of its own, whatever the slider is set to, and that level is the finest of 2.2.2. The globe is a picture of the world rather than a picture of the hex map: the whole planet is on screen at once, so at the coarse levels a single hex covers a swathe of it and a coastline comes out as a handful of blocky steps. The map is where the grid is read hex by hex; the sphere is where the shape of the world is read.

4.4.9.1 The heights on that grid are read off the same field the surface on screen was sampled from rather than off a field built again for it. Building the field is the expensive half of the work and is the same work whichever grid is being sampled. Spec 3.2.4 is what makes reading it twice sound: a point has one height at any depth, so the two grids cannot disagree about the ground they share.

4.4.9.2 The grid itself is built once and kept, since it is the same grid for every world and nothing about it depends on the planet. Where the map is already at that level the two panels share the map's own grid rather than holding two copies of it.

4.4.9.3 The panel therefore knows nothing of display hexes. What is marked on it arrives as the corners of a hex rather than as a hex of some grid, and a click leaves it as the point of the sphere it landed on. Both are directions, which mean the same thing at every level, and it is the caller that knows which level it is asking about.

4.4.9.4 What is marked is still the display hex. The selection of 4.4.4 is the hex the user chose in the other panels, a click on the sphere selects the display hex covering the point by the rule 6.6.1.1 already uses for a point of interest, and the rings of 4.4.8 go round the covering hex as they do on the map. A mark the size of a finest-level hex would be a dot on a globe, and one selection shown in all three panels under 4.1.3 has to be the hex all three of them can name.

4.4.9.5 The finest level, and four times the hexes turns out not to be four times the cost. The grid is built once a session and kept; the mesh is rebuilt at every redraw, but that is a fraction of what a redraw does, and against half this level it adds about a sixth of a second to one, some thirty parts in a hundred. What it buys is the coastline, which is drawn hex by hex and is the one thing on this panel that shows the difference. The reader has no slider here to trade the one for the other, so the choice is made for them, and it is made in favour of the picture.

### 4.5 Local detail panel

4.5.1 Beneath the globe, the selected hex and the ground around it, drawn at a finer subdivision than the display grid under 3.5.

4.5.2 It is not a magnified copy of the middle panel. The display grid samples a field only as fine as itself, so drawing the same heights larger would add nothing. The panel samples several levels deeper, and shows detail inside a single hex that the other two panels cannot resolve.

4.5.3 The clicked hex is outlined at its own size, so the patch can be read against the middle panel rather than floating free of it.

4.5.4 The patch reaches about two and a half hexes out, and continues onto neighbouring faces where it crosses a seam under 3.5.3.

4.5.5 With no hex selected the panel says so rather than showing an arbitrary place.

4.5.6 The selected hex's properties are drawn as an overlay over the patch: its coordinate, height, terrain band, side count, and latitude and longitude. They belong with the hex rather than in the left panel, which 4.2.1 keeps for what the user can edit. With nothing selected the overlay is hidden, since 4.5.5 already says so at greater length.

4.5.6.1 Where the hex covers several points of interest, the readout names them all, one to a line and each in the colour of its kind, for the reason 4.3.5.1 gives for the tooltip. A count says something is there without saying what, which is the one thing the reader cannot work out by looking.

4.5.6 The panel's own subdivision follows the detail level, staying a fixed number of levels below it, so it always draws the same number of fine cells over the same number of display hexes. The levels of 2.2.2 all give the same ratio, so the panel keeps its proportions across the slider and only its absolute scale moves.

4.5.6.1 That is not the drift 3.2.4 rules out. Under 3.5.2 a point has one height at any depth it is evaluated at, so what changes here is how finely the patch is drawn and never what is under it. The bar of 4.6.3.1 says which scale the panel is currently at.

4.5.7 Clicking in the patch opens the point of interest dialogue of 6.5.4 on the fine hex that was clicked. That is the hex a point of interest is attached to: this panel draws the ground at the scale a place on it is, and the display hex is far too large to say where anything is.

4.5.7.1 The click is answered with the hex that owns the point, which is not what rounding the two lattice counts on their own gives: that gives the rhombus around a lattice point rather than its hexagon, and near a corner it answers a hex two steps away. The third axis of the lattice is rounded as well and whichever of the three moved furthest is put back from the other two.

4.5.7.2 The display hex the click fell in comes back with it, since that is what the map and the globe can show a selection on. Clicking the patch therefore selects the ground the dialogue is about as well as opening it.

4.5.7.3 This is the panel that takes the click because it is the one drawn at the scale of a place on the ground. The middle panel's click already selects, under 4.3.2, and one gesture cannot do both.

4.5.7.4 Points of interest the patch reaches are ringed on it at the size of the hexes it draws, and named beside them in the colours of 5.5.1. A point placed at another depth is ringed on the fine hex covering it, by the same rule 6.6.1 places one on the map. The name beside the ring is what carries at a glance; the ring says which hex the name is about.

4.5.7.5 The ring goes between the hexes as 4.3.4.1 has it for the map, but at the map's proportion of a hex rather than this panel's own. The patch draws its seams several times finer than the map draws its own, and a mark that thin is a mark nobody can see.

4.5.7.6 The name is set small and clear of the ring rather than against it, so it reads as a label on a hex instead of another line drawn across it.

4.5.8 The panel offers contour lines over the patch, off until asked for. The colours of section 5 say what height a piece of ground is; what they cannot say is how quickly it changes, and lines through the ground at a fixed height apart are how a walking map says it: close together is steep, far apart is gentle, and a closed ring is a summit or a hollow.

4.5.8.1 The switch sits beside the panel's own heading rather than among the fields of 4.2. It changes how this panel draws, and nothing about the world, so it neither redraws the surface nor counts as an unsaved change under 6.4.4. It is a view of the planet and not part of it, so it is not saved with it either.

4.5.8.2 A line is drawn between two neighbouring hexes whose heights fall either side of a level, along the side they share. So it runs on the hex boundaries and every hex is wholly on one side of it, which is the truth about a hex map: the ground is known a hex at a time, and a smooth line drawn through the middle of them would claim to know whereabouts inside a hex the height is passed. The line steps from side to side instead, and lies exactly on the colour it separates.

4.5.8.3 The interval is a round figure at or above the span of the ground in view divided by the number of lines wanted, for the reason 4.6.3 gives the scale bar. A fixed interval draws one line across a plain and fifty down a mountainside, and neither of those is a map.

4.5.8.4 Levels are counted from sea level rather than from the lowest sample in view. That puts a line on the coast, and it holds the lines still as the pointer moves from one patch to the next, where counting from the patch would slide every line each time the window moved.

4.5.8.5 Lines below sea level are drawn light and lines above it dark. A dark line is lost on the deep sea and a light one on snow, so each half of the ramp gets the line it can carry. Neither is opaque: the colour underneath is what says which way the ground falls, and the line only says where it passes a height.

4.5.8.5.1 The light line is keyed to water rather than to snow. A near-white line reads brightest on the deep sea, where there is least colour behind it to hold it down, so the lines would shout loudest exactly where they say least. Every line under water is drawn the same, whatever depth it is at.

4.5.8.6 A hex at exactly a level counts as at it rather than below it, so the line runs along that hex's near side. Two hexes of the same height are parted by nothing, whatever that height is, which is what makes a level lying exactly on the ground no more trouble than any other. A flat patch at the height of a level therefore carries no line, and correctly: there is nothing there to cross.

4.5.8.7 With the lines drawn, the seams between the hexes give way to them. A seam left under a contour is the same mark saying less, and a seam anywhere else is the one thing on the panel competing with the lines for the reader's eye. What the seams say about where one hex ends, the lines now say where it matters, so the patch is drawn as continuous ground with the contours the only lines on it. With the lines off the panel is drawn exactly as it was: the seams are how the panel says it is a hex map at all, and they are only worth trading for something that says it better.

4.5.8.7.1 Two fills sharing an exact edge still leave a hairline of the ground behind showing between them, so with the seams off the fills are drawn a hair large and overlap. The margin is far below what would move a colour boundary away from the line drawn on it.

4.5.9 The panel offers a second view of the same ground: lit, standing up, and seen from over it rather than from above it. Off until asked for, by a switch beside the panel's heading as 4.5.8.1 has it. The flat view is the hex map; this is the country the map stands for, and a reader who wants to know what a stretch of ground is like rather than what its heights are is asking for this one.

4.5.9.1 It is seen from thirty degrees above the ground, and without perspective. At that angle a step of depth into the drawing is worth the sine of it and a step of height the cosine, so distance stays true across the drawing and is foreshortened up it. That is what lets the scale bar of 4.6 stand in this view unchanged: the bar is horizontal, along the axis that kept its scale.

4.5.9.2 The surface runs smoothly through the same heights the flat view colours its hexes from, on the triangles the lattice already makes between neighbouring hexes. It is not stepped. A hillside is not made of hexagons, and a picture of one should not be either: the hexes are how the map is drawn, not how the ground is shaped. The two views are two readings of one field, so they cannot disagree about where the coast is.

4.5.9.2.1 A hex on the rim of the patch has only part of a ring of triangles round it, so the slope worked out there leans out over the edge and the outermost strip of ground comes out as a row of dark teeth. Each rim hex is lit as the hex one step inside it is instead, which is the ground it is the edge of.

4.5.9.3 Height is exaggerated by a fixed amount rather than stretched to fill the panel. Some exaggeration there must be: a patch is hundreds of kilometres across and its ground rises by single kilometres, so drawn to the truth of it a mountain range would be a flat sheet. Fixed, though, so that gentle ground is drawn as gentle ground and two patches of one world can be read against each other. The figure is set where rough ground reads as hills rather than as spikes.

4.5.9.3.1 The ground stands on a block: the patch's own hexagonal footprint, walled down to a floor under the lowest ground in view and cut earth down the sides. Without it the surface would be a sheet hanging in the panel with nothing under it.

4.5.9.3.2 The sea is a sheet at sea level rather than a colour painted on the ground, and the water at the sides of the block is walled like the earth is. The block is a piece cut out of the world, so where the sea is deep at the edge of it the cut goes through water as well as through earth. A sheet with nothing under it at the rim would hang over the walls instead of standing on them.

4.5.9.4 The lit ground is drawn in its own canvas, with the same library the globe of 4.4 uses. What has to go over it is drawn in the panel's own SVG through the projection of 4.5.9.1 written out as arithmetic, so that a mark sits on the ground it is about rather than near it. This is why the view is drawn without perspective: the two would otherwise part company by however far from the middle of the panel a mark fell.

4.5.9.4.1 The outline round the selected display hex of 4.5.3 is not drawn in this view. It is there to say which hex of the map the patch is of, which is a question about the map; over lit ground it is a wire hoop standing in front of the thing the view was turned on to look at.

4.5.9.5 Points of interest are marked and named here as 4.5.7.4 has them, but cannot be placed. A click would have to be put back through the projection onto ground that may be hidden behind nearer ground, and a point landing on a hex the reader did not mean is worse than a panel that does not take the click. The flat view is where they are placed, and it is one switch away.

4.5.9.6 The contour lines of 4.5.8 belong to the flat view, and their switch is turned off while this view is on rather than left offering something it would not do. What a contour says about a slope, a lit hillside shows. The setting is kept, and comes back with the flat view.

4.5.9.7 Like the contours, this is a view of the planet and not part of it: it neither redraws the surface nor counts as an unsaved change under 6.4.4, and it is not saved with the planet.

### 4.6 Scale

4.6.1 The flat map and the local detail panel each carry a scale bar. Both are drawn in map units, so they scale with their panel and keep their length relative to the hexes.

4.6.2 Distance comes from the diameter of 6.12. A face edge spans a fixed angle, so its length on the surface follows from the diameter alone, and one hex is that divided by the row count of 2.2.1.

4.6.3 The bar is a round figure at or below a quarter of the panel width, rather than a fixed distance that might not fit. On the flat map it is measured against what is on screen rather than against the whole net, so it holds its size on the panel as the map is zoomed under 4.3.6 and the figure it shows follows the zoom.

4.6.3.1 Under the round figure, each panel also gives the width of one hex as that panel draws it. The flat map reports its display hex; the local panel reports its finer hex, which is the one it is actually drawing. Neither repeats the other, so the two together say what both scales are.

4.6.3.2 A hex width keeps a decimal below 100km. Rounding is right for a bar labelled in round numbers and wrong for a hex 2.7km across.

4.6.3.3 A panel with a further scale of its own puts it under the other two, which is where the contour interval of 4.5.8 is given. The interval is a height rather than a distance, and it is shown in the same figures the readout of 4.5.6 gives the hex, to however many places it has.

4.6.4 An unreadable UWP has no diameter, so neither panel shows a bar rather than showing a wrong one.

4.6.5 Both bars stand in the bottom left corner of their panel rather than inset from it. On the local panel that is under the readout of 4.5.6, which stands in the top left of the same panel: the two are the panel's furniture and belong at its edges, not out over the ground it draws. The patch is a hexagon, so its own corners are empty and the bar stands clear of the hexes there anyway.

4.6.5.1 That means the local panel's drawing is given the panel's proportions rather than the patch's, by growing the shorter side of the window the patch is drawn into. A drawing whose shape does not match its panel is centred in it, which would leave the bar floating in from the panel's edge by however much the shapes differ. The panel is redrawn when it changes shape, for the same reason the globe watches its own element.

4.6.5.2 The flat map's bar carries labels at half the size of the local panel's. The map is the busier of the two panels and can afford the less furniture.

### 4.8 Help

4.8.1 The application carries its own help, opened from a button in the left panel's header, and from the keyboard by F1 or by ?. The packaged build is one executable a user has downloaded on its own: they have the program and nothing else, no README beside it and no repository to read one in. Help that lives outside the program is help that user does not have.

4.8.1.1 F1 is what a Windows user reaches for, and the packaged build is a Windows application. A browser tab is the case F1 does not cover: Chrome keeps that key for its own help and will not hand it over, so ? is offered alongside it. Neither is the way in on its own, which is what the button is for.

4.8.2 It is a dialogue over the three panels rather than a page of its own, so it can be read against the thing it describes and shut without losing the planet on screen. Escape closes it, as it does the dialogue of 6.5.4.

4.8.3 It says what each panel shows, what can be edited and what is worked out, how a hex is named under 2.4, what the pointer does in each panel, and what Save writes. It does not repeat the reasoning of this document. A user wants to know what the application does; the reasons it does it that way are the business of whoever changes it.

4.8.4 It carries the licence in full: the MIT terms with the copyright line, the notice for the third party icon the application is marked with, and the note that Traveller's terms are used under 1.1.1 without its text.

4.8.4.1 The MIT licence requires its notice to travel with the software. A text file beside a portable executable does not travel with it: the executable is one file and is moved, copied, and mailed as one, and the notice beside it is left behind on the first of those. Inside the program it cannot be separated from what it licenses.

4.8.4.2 The resource beside the executable stays as well. It costs nothing, and a licence is read by people who are looking for a file called one.

4.8.5 The help text is part of the bundle rather than a file fetched at the time it is opened. There is no server under 6.4.1, and a fetch that fails would take the licence of 4.8.4 down with it.

## 5. Colouring

5.1 Height is shown as a colour running from blue for sea, through the ground colour of 5.6 for land, to grey and white for mountains.

5.2 Sea level is driven by the UWP. The hydrographics detail value of 6.12 says what fraction of the surface is water, and sea level is set to whatever height puts that fraction under it. The boundary between blue and green is the coastline and reads as one on both the map and the globe.

5.2.1 Sea level is read off the finished heights, after 3.4 has shaped them. The hydrographics digit therefore does two things: it weathers the surface under 3.4.3, and it decides how much of the result ends up underwater.

5.2.2 Because sea level moves, heights are normalised against it before the ramp is read, with sea level at the middle. A nearly dry world still runs green through grey to white across its land rather than coming out as one unbroken sheet of mountain.

5.2.3 An unreadable UWP has no hydrographics to work from, so sea level falls back to the midpoint.

5.2.4 The fraction is measured against one fixed lattice rather than against the hexes on screen. The same quantile taken from 362 hexes and from 23042 does not land in the same place, so reading it off the current level would let the coastline move when the detail level moved, which is the one thing 3.2.4 is arranged to prevent.

5.2.4.1 The lattice is 48 rows, which is not the finest level. A quantile is settled by twenty three thousand samples: measured on the finest lattice instead, the answer moves by under a thousandth of the height range, which is a small fraction of one contour interval and cannot be seen on a coastline. What it does cost is four times the sampling, and this is worked out again at every touch of the UWP. The finest level is where the world is drawn; this is where it is measured, and only one of those two jobs gets better with more samples.

5.3 The reference images use flat colour per hex rather than a smooth gradient. The hex should stay legible as a discrete game unit.

### 5.4 Polar ice

5.4.1 Any world with water is drawn with ice at both poles. How far the ice reaches is what the profile decides, and on most worlds that is a little rather than none.

5.4.2 Axial tilt, from 6.12.3, is the main lever. It is the seasonal tilt of 6.12.3.7 that is read, so a retrograde world is treated by how far its axis leans rather than by which way it turns. An untilted world has poles that never see the sun climb, so its caps are broad and stable. Raising the tilt gives the poles a summer, and past the point where they take more sunlight over a year than the equator does, no permanent cap holds at all.

5.4.2.1 Pressure is the second. Thick air holds heat in and pushes the ice back. This is a proxy rather than a derivation: the cheatsheet has no temperature, and the profile says nothing about orbital distance, so a frozen world far from its star and a temperate one close in carry the same digits. Pressure is the only thing on the sheet that bears on how warm a world keeps itself.

5.4.2.2 The two are set so that a world of Earth's tilt at one atmosphere puts about a tenth of its surface under ice.

5.4.3 The Ice-Capped trade code of section 7, atmosphere 0 or 1 with water to freeze, sets a floor rather than a gate. Such a world has caps at least that broad however the levers of 5.4.2 work out, because there the profile states the answer outright instead of leaving it to be inferred. It is a floor and not a ceiling: an untilted ice-capped world exceeds it.

5.4.3.1 Reading the trade code as a gate rather than a floor was the earlier mistake. It classifies worlds that are frozen, not worlds that have caps, so it left an Earth-like profile with no ice at all.

5.4.4 The caps cannot cover more of the surface than the world has water to make them from. This bounds the floor of 5.4.3 as well: a profile can say a world is ice-capped, but not that it has more ice than water.

5.4.5 Ice pales the ground rather than painting it out, so a mountain under a cap still reads as a mountain, and the hex readout says whether the ice sits over land or over sea.

5.4.6 Ice is drawn, not generated. It does not move a height, and it does not change sea level: the water counted by 5.2 is counted whether it is frozen or not.

### 5.5 Points of interest

5.5.1 A starport is drawn red and a comment pale grey, on the map of 4.3.4, on the globe of 4.4.8, and in the patch of 4.5.7.3. The two kinds of 6.5.2 are told apart by colour alone, so which is which can be seen at a glance across the whole map rather than read one hex at a time.

5.5.2 Both colours are brighter than anything the height ramp of 5.1 or the ice of 5.4 produces, so a mark reads over deep sea, over mountain, and over a polar cap alike.

5.5.3 A mark is an outline rather than a fill, on all three panels. The terrain under a point of interest is still the terrain, and a starport that painted out its own hex would hide the ground it was built on.

5.5.4 Neither colour is the accent the selection of 4.3.3 is drawn in. A comment was yellow first, which is close enough to that gold that a selected starport read as red and yellow at once: two kinds of mark rather than a mark and a selection. Grey settles it and leaves the selection its own colour, which is the gold this application marks the user's own choices in everywhere else.

5.5.4.1 The selection is drawn over the marks rather than under them, and a mark is drawn wider than the selection outline that may cover it, so a hex that is both still shows a rim of the colour saying what is on it.

### 5.6 Ground colour

5.6.1 Land is not always green. Green is what a world with plants on it looks like, and most profiles do not describe such a world. Each planet carries a verdancy in [0, 1], and its land is drawn between two ramps: a green one at 1 and an arid one, in ochres, sand and warm rock, at 0.

5.6.2 Verdancy is the product of three factors, one for each of the things ground cover needs and the profile speaks to. Any one of them at zero leaves a world bare on its own, which is why they multiply rather than average.

5.6.2.1 Air, from the atmosphere digit. The breathable middle of the table scores highest, and the taints cost little, since what makes air unbreathable to a traveller is rarely what a plant minds. Below thin there is not enough gas to keep water on the surface; exotic, corrosive and insidious describe chemistries nothing photosynthetic has purchase on.

5.6.2.2 Water, from the hydrographics detail value of 6.12. A world with a few percent of its surface wet is a desert and reads as one from orbit; past about a quarter, the land is watered everywhere.

5.6.2.3 Warmth, from the mean surface temperature of 6.15. Cover survives over a wider band than water is liquid across, because a mean is not an everywhere: a cold world still thaws at its equator and a hot one keeps its poles.

5.6.3 The two land ramps share their stops, so the blend cannot move the coastline of 5.2 or the snow line. The sea is not blended at all: water is water on a dead world too. The peaks stay pale on both, since snow and stripped stone are as light on a bare world as on a living one.

5.6.4 An unreadable UWP gives a middling world rather than a lush one, since nothing then says it has anything growing on it.

5.6.5 This is not a claim about life. A world may carry things that are not photosynthetic, or a referee's may be covered in something that is not green. It is what a world with that profile most plausibly looks like from orbit.

### 5.7 Views

5.7.1 The world is drawn one of two ways, and which is a view option under 4.2.6: it says nothing about the planet, so it is not saved with it and does not mark it unsaved. Both views read the same heights, the same sea level and the same ice, and all three panels of section 4 draw whichever is chosen. The saved pictures and the coloured exports of 6.17 are drawn in it too, since a save writes down what was on screen, and the manifest of 6.22 records which it was.

5.7.1.1 **Terrain** is 5.1 to 5.6, unchanged: height as colour, blue through the ground colour to grey and white. It is a map. It says how high the ground is, which is what a referee measuring a march across it wants, and its greys and whites climb with altitude whatever the world is made of.

5.7.1.2 **Visible** is what an eye in orbit would see. It answers one question, what colour is that ground, and it reads temperature where the other reads height. Green where things grow, brown where the ground is bare and weathered, grey where it is bare and unweathered, white where water is frozen, and the sea a darker blue than the map's, because a sea drawn to be looked at is not a sea drawn to be read over.

5.7.2 Ground cover is the verdancy of 5.6 taken a place at a time rather than once for the world. The air and water factors of 5.6.2 are the world's and do not vary; the warmth factor is read at the local temperature of 5.7.3. A world whose mean is temperate is jungle at its equator and tundra at sixty degrees, and one colour for the whole planet cannot say that.

5.7.2.1 Bare ground comes in two colours, and what separates them is weather rather than life. Dust, sand and iron oxide are what a surface turns when air and water have worked on it over geological time; a world with neither keeps the colour of its own stone. Mars holds six thousandths of an atmosphere and is the reddest surface in the solar system, and Luna holds none and is grey, so a trace of air is enough and a vacuum is not. Water weathers faster but a trace of it will not do: a hydrographics digit of 0 still allows a few percent, and a few percent of frost on an airless rock leaves it an airless rock.

5.7.2.2 The subtropics are drier than the latitudes either side of them. Air rising over the equator comes down about 26 degrees north and south of it, and it comes down having already rained: the Sahara, Arabia, the Kalahari, the Thar, the Atacama and the Australian interior are one band and the same band. A world drawn without them has an unbroken green waist that no planet has. It takes air to happen, so the belts are scaled by how much of it there is.

### 5.7.3 Temperature by latitude

5.7.3.1 The mean surface temperature of 6.15 is a mean. What the visible view needs is the temperature at a place, and that follows from the mean, the axial tilt and the pressure.

5.7.3.2 Sunlight averaged over a year varies with latitude as the second Legendre polynomial, and the size of that term goes as one minus three halves of the square of the sine of the seasonal tilt of 6.12.3.7. It is full on an untilted world, nothing at 54.7 degrees, and negative past it: a world lying on its side takes more sunlight at its poles than at its equator over a year, and is drawn that way, ice at the waist and green at the ends. That is the same 54 degrees 5.4.2 puts the last permanent ice cap at, because it is the same fact about sunlight.

5.7.3.3 Air rubs the difference out. Sunlight sets the contrast and a year of weather spends itself reducing it, so the figure is divided down by the pressure: Venus is within a degree or two of itself from equator to pole, and an airless world swings the whole way.

5.7.3.4 Calibrated to Earth. Twenty three degrees of tilt at one atmosphere gives about 47K between equator and pole, which on a world averaging 14C is 30C at the equator and -18C at the poles.

5.7.3.5 The profile has zero mean by construction, so warming one latitude cools another and the world's own mean is the figure 6.15 worked out. Leaning the axis redistributes heat; it does not add any.

5.7.4 Snow is placed by the local temperature, and it is permanent snow rather than snow that falls. The line climbs from the water's edge on ground averaging -15C to the summits alone at 27C, which puts Earth's at about 5,000m at the equator, 2,700m at 45 degrees, and on the shore past 70. It is the one place this view still reads height, and it needs water: a world with a trace of it has no snowfields, however cold it is.

5.7.5 The caps of 5.4 are drawn as ice rather than as pale ground. Frozen water is white, and it is white over sea and over land alike, so the cap reads as a sheet rather than as terrain seen through frost. This is the one thing the two views deliberately disagree about, and 5.4.5 gives the reason the map does it the other way: a map has to keep the terrain legible under the ice and a photograph does not.

5.7.6 What does not change between the views: the coastline, the ice edge, the heights, the hex readout of 4.5.6, and the grey heightmap of 6.21. The view is paint. Nothing under it moves.

## 6. Planet data and persistence

6.1 A save contains the following.

| Field | Notes |
| --- | --- |
| Planet name | Free text. |
| Sector | The sector the world sits in, see 6.14. Free text. |
| Hex | Its four digit hex within that sector, see 6.14. |
| UWP | The Universal World Profile, see 6.7. |
| Narrative text | Free prose about the world, written by the user. Plain text, no length limit. |
| Points of interest | The hex attachments of 6.5, each with its kind, name, narrative, and the point of 2.4.8 it sits on. |
| Seed | Required. Without it the surface cannot be rebuilt on load. |
| Detail | The detail level of 2.2.1, stored as its row count. |

6.2 The seed and the detail level are not user facing content in the way the other fields are, but a save is useless without them, so they are stored alongside.

6.3 A save does not hold the generated heights. Load rebuilds them from the seed and the detail level.

6.4 Save writes the planet out, Load reads one back, and New starts a fresh planet with a new random seed.

6.4.1 A save is a folder on the local disk holding one planet: its JSON, the map images of 6.4.5 at the levels asked for, and whatever else the dialogue of 6.23 was asked for. No server is involved and nothing about a planet leaves the machine.

6.4.1.1 The application uses the File System Access API. The first Save of a planet asks for the folder to save into. Load opens a file picker on the JSON.

6.4.1.2 The application holds the folder handle for the current planet for as long as the planet is open, so repeated saves do not re-prompt and rewrite the same files.

6.4.1.3 The API is Chromium only and needs a user gesture plus a permission grant. Firefox and Safari cannot run the application as specified. If that becomes a problem, a download and file picker fallback is the way out, and it changes only 6.4.1.1 and 6.4.1.2.

6.4.1.4 A folder rather than a file because 6.4.5 and 6.17 put more than one file in a save. The API gives no route from a file handle to the folder holding it, so a planet picked as a file cannot have its images written next to it. That is also why Load leaves the folder unset: it can read the file the user chose, but it cannot tell where that file lives, so the next Save asks.

6.4.4 The application tracks whether the open planet has unsaved edits, and warns before anything discards them.

6.4.4.1 An edit is any change to a stored field of 6.1: name, sector, hex, UWP, narrative text, points of interest, seed, or detail level. Changing the seed or the detail level regenerates the surface under 4.2.4, but it also changes what a save would contain, so it counts.

6.4.4.2 New, Load, and leaving the page all check first. The user can save, discard, or cancel and stay where they are.

6.4.4.3 The page-exit warning is the browser's own dialog. Its wording cannot be set, and browsers suppress it unless the user has interacted with the page. The New and Load prompts are the application's own, so those can name the planet and say what is about to be lost.

6.4.4.3.1 The desktop shell has no such dialog to fall back on. Chromium embedded leaves the warning to whatever is embedding it, and an embedder that does nothing leaves the refusal standing with nothing on screen: the user presses the close button and the window ignores them, which is worse than either warning them or letting them go. So the shell puts up a dialog of its own, and the wording there is the application's, since it is the application asking.

6.4.4.3.2 Its two answers are to close without saving or to stay. Saving is not among them, because a save needs the folder of 6.4.1.1 and a picker cannot be opened from the shell on the page's behalf. Staying is the safe answer, so it is the one the dialogue starts on.

6.4.4.4 The left panel shows whether the open planet has unsaved edits, so the state is visible before a prompt appears rather than only at the moment something is at risk.

6.4.2 The document carries a version number. The later phases in 6.5 and 6.7 add fields, and a loader that meets a version it does not know should say so rather than opening a partial planet.

6.4.3 Load validates what it reads. A document missing the seed or the detail level cannot produce the planet it claims to be, and failing loudly beats opening a different world under the right name.

6.4.3.1 A detail level that is not one of the four in 2.2.2 is snapped to the nearest that is, rather than refused. Under 3.2.4 the field is the same at every level, so this changes how much of the world is drawn and not which world it is, which is not the kind of mismatch 6.4.3 is guarding against.

6.4.5 A save also writes the flat map as a PNG, named for the planet and the row count that drew it, at each of the detail levels of 2.2.2 the dialogue of 6.23 was asked for.

6.4.5.1 The images are drawn by the renderer that draws the panel, on a map framed on the whole net rather than on wherever the user has zoomed to. Under 3.2.4 they are the one world at several resolutions, not several worlds. The same detached map is what the vector export of 6.17 writes out, so a picture and its vector original are not drawn two different ways.

6.4.5.2 Each is 2048 pixels wide, which is enough to tell one hex from the next at level 48, where there are 23,042 of them. The scene of 6.20 is the one picture drawn at another width, and it is drawn at a width the grid it is for asks for rather than at one chosen for reading.

6.4.5.3 Drawing every level takes seconds, the finest most of them. Save says what it is doing and refuses a second start until the first has finished. The folder is asked for before the drawing begins, since the picker needs the gesture that opened it and would not survive the wait.

6.5 Generated hex information cannot be edited. Height and everything derived from it come from the seed, so there is no user override to store and no way for a saved planet to disagree with what the generator produces. What can be attached to a hex is a point of interest. It is user data rather than generated data, so a save stores it explicitly, keyed by the hex name from 2.4.

6.5.1 A point of interest has a kind, a name, and a narrative. The name is what the map and the lists call it; the narrative is free prose about it, as 6.10 describes the planet's own.

6.5.2 There are two kinds. A starport is a place on the world. A comment is a note about one, which covers everything a referee wants to write on a hex without inventing a kind for each.

6.5.2.1 The starport of a point of interest is not the starport letter of the UWP. The letter says what quality of port the world has; this says where on the world it is. A world can carry more than one, and a world whose profile says X can still have a landing field somebody put there.

6.5.3 One point of interest to a point. Two on one point could not both be drawn there, and the dialogue of 6.5.4 has one point to open on. Placing a second replaces the first. This is about the point it is attached to, not about the hex some level happens to draw it on, which 6.6.3 covers.

6.5.4 A point of interest is created, edited, and deleted in one dialogue, opened by clicking a hex in the local detail panel under 4.5.7. It carries the kind, the name, and the narrative, and the delete is offered only where there is something to delete.

6.5.4.1 The dialogue names the point it is about, in the written form of 2.4.8.2, and says where the point is finer than the map draws, so it is clear that the mark on the map is on the hex covering it rather than on the point itself.

6.5.5 A save written before points of interest existed has none, which is the same planet as one nobody has annotated. That needs no version of its own, for the reason the settings of 6.15 do not.

6.5.5.1 Nor does the depth of 2.4.8. Every point of interest written before the fine lattice sat on a display hex, so a coordinate with no depth means the reference lattice, which is what those saves meant.

6.5.8 A new planet starts with a point of interest for its starport, named for the class the profile gives it: Starport A, and so on down to Starport E. The profile already says the world has one, so a new planet arriving with nothing on it is the application knowing something and drawing none of it.

6.5.8.1 It is placed on coastal land, on a landmass large enough to hold a town, as near the equator as those allow. Ships come down beside water and on ground worth building on, and warm beats cold where there is a choice. Nothing here reads the population digit, because nothing in the surface says where the people are: this is the best guess the terrain alone supports.

6.5.8.2 The three are ranked rather than required. Coastal land beats plain land, which beats open sea, and within a band the site nearest the equator wins, with a small penalty for sitting on a lesser landmass. So a world with no coast still gets a starport, and so does a world with no land: a world without one is a decision for the profile to make, not for the terrain.

6.5.8.3 A profile of X has no starport to place, and an unreadable profile says nothing either way, so neither gets one.

6.5.8.4 It is an ordinary point of interest once placed. The user can move it, rename it, write it up, or delete it, and nothing regenerates it: only New places one, so a planet the user has emptied stays empty.

6.5.8.5 Rolling a new profile renames the world's starport and places it again. A reroll is a different kind of world on the same seed: the letter is a different letter, and under 3.4 the ground is different ground, so the site the terrain picked was picked for a world that no longer exists. Left where it was, the port is as likely to be in the sea as on the coast it was put on.

6.5.8.5.1 The narrative comes across untouched, as it does through a move under 6.5.9.3. What the user wrote about the place is theirs. Where the port is and what class it is are the profile's, and the reroll is what asked for a new one.

6.5.8.5.2 Editing a digit by hand does not move it. That edit shapes the surface as much as a reroll does, so the distinction is not in what changes underneath but in what was asked for: a digit is typed by someone working on this world with its ports in view, and moving one under them at every keystroke is the application arguing with the person editing. A reroll asks for a different world outright, and gets one.

6.5.8.5.3 Only where the world carries one starport. Several is an arrangement the user made, and nothing in the profile says which of them it is talking about. The reroll leaves all of them and says so, rather than picking one.

6.5.8.5.4 A new profile of X takes the starport away. The profile is what says whether a world has one, and 6.5.8.3 already declines to place a port on such a world; leaving one standing would be the same contradiction arrived at from the other side. An unreadable profile says nothing either way, so it leaves what is there alone.

6.5.8.5.5 A world the user has emptied stays empty, as 6.5.8.4 has it. The reroll moves the starport the world has; it is not a second route to the one only New places.

6.5.9 The dialogue opened on a point with nothing on it offers Move Here: a list of the points of interest the world already has, and a button that moves the chosen one to this point.

6.5.9.1 A point of interest is placed by clicking where it goes, so moving one is the same gesture: click where it should be and say which one belongs there. Without it, moving something means writing it out again at the new point and deleting the old one, which is a copy and a deletion rather than a move, and loses the narrative to a retyping.

6.5.9.2 Only where the point is empty. A point already holding one has nowhere for a second to land under 6.5.3, and the dialogue there is already about the one that is on it.

6.5.9.3 Moving changes where a point of interest is and nothing else. The kind, the name, and the narrative come across untouched, which is what makes it a move.

6.5.6 A point of interest that cannot be read on load is dropped rather than the file being refused. Unlike the seed of 6.4.3 it is not something the planet cannot be rebuilt without, and losing one note beats refusing the world it was written about.

6.5.7 The left panel lists the points of interest on the world, so what is on it can be read without hunting the map for marks. Choosing one selects the hex it is drawn on and opens the dialogue on it.

6.6 A point of interest is attached to the hex it was placed on, at the scale it was placed at, and it is stored by that hex's name under 2.4.8. Placed in the local panel, that is one of the fine hexes that panel draws, which is finer than any level of the map. The name does not depend on what is being viewed, so moving the slider neither invalidates one nor moves it.

6.6.1 Every panel draws every point of interest, on whichever of its own hexes covers it. A panel that has the hex itself puts it there, since a point is covered by its own hex. Everything coarser puts it on the hex whose ground it falls on: the same place on the world, said less precisely, which is what a coarser drawing is. One placed on a fine hex of the local panel lands on one of the 362 hexes of level 6, not on nothing.

6.6.1.1 The covering hex is the one whose centre the point of interest is nearest. The cells are the dual of the lattice under 2.1.1, so the hex nearest a point is exactly the hex whose ground that point is on, and no separate rule for containment is needed. It is one rule for every panel at every scale, which is why the map, the globe, and the patch cannot disagree about where a point of interest is.

6.6.1.2 The stored coordinate is not touched by any of this. Going back to a finer level puts the point of interest back on its own hex exactly, and what a save holds is where the user put it rather than where some level happened to draw it.

6.6.2 So there is nothing to warn about. An earlier version hid points of interest the current level could not draw and counted them for the user, which made the slider lose things and made the count necessary. Drawing them on the covering hex removes the problem rather than reporting it.

6.6.3 Several points of interest can therefore share a hex on screen while sitting on different points underneath, and on the map they usually will: a display hex covers dozens of the hexes the local panel draws. The one to a point of 6.5.3 is about the stored coordinate, not about what a coarse drawing shows.

6.6.3.1 A hex is marked once however many it covers, and a hex covering both kinds is marked as a starport, a place on the world being the more specific of the two. The tooltip of 4.3.5 leads with one and says how many others are there, so the map stays readable and nothing is silently dropped.

6.6.3.2 The dialogue is opened from the local panel, where the hexes are the hexes points of interest sit on, so it always opens on one point rather than on a pile of them.

6.7 A planet has a UWP, the Universal World Profile: a starport letter, then six digits for size, atmosphere, hydrographics, population, government, and law level, then a dash and the tech level. Digits above 9 run on as hex, so 10 is A. Example: B564A98-9. In a later phase it is rolled when the planet is created, and the user can then edit it.

6.7.1 The positions and their ranges, from the cheatsheet in section 7.

| Position | Range | Notes |
| --- | --- | --- |
| Starport | A to E, or X | Quality, best to worst. X is none. |
| Size | 0 to A | Diameter in 1600km steps, 0 being under 1000km. |
| Atmosphere | 0 to F | 0 is vacuum. |
| Hydrographics | 0 to A | Surface water in 10% steps. |
| Population | 0 to F | The exponent: the digit n means 10^n inhabitants. |
| Government | 0 to F | 0 is none. |
| Law level | 0 to 9 | |
| Tech level | 0 to F | Follows the dash. |

6.7.2 The roll follows Traveller's world creation rules, from the SRD in section 7. Every position is 2D, chained off the ones before it: size, then atmosphere and hydrographics from size, then population, then government from population and law level from government, then tech level as 1D plus modifiers drawn from all of it. Starport is its own 2D table.

6.7.2.1 The chaining is the point. Plain random digits in each position produce a profile that cannot be read as one world: a moon holding a dense atmosphere, an ocean on a body with no gravity well, a bureaucracy where nobody lives. Since 6.8 makes the UWP an input to generation, an incoherent profile is not merely odd on the panel; it asks the surface to be two things at once.

6.7.2.2 Some positions are forced rather than rolled. Size 0 leaves atmosphere and hydrographics at 0, size 1 leaves hydrographics at 0, and population 0 leaves government, law level and tech level at 0. An atmosphere that will not hold surface water — none, trace, exotic, corrosive, insidious — takes a -4 on hydrographics.

6.7.2.3 The temperature modifiers on hydrographics are not applied, because nothing in the application yet says how hot a world is. That is a gap of the kind 6.9 describes rather than a departure from the rules.

6.7.2.4 The dice come from the seed, not from Math.random. The profile is therefore part of what the seed names, and a shared seed carries its world's kind along with its shape. The reroll button of 6.11 is the way to keep a seed and change the profile.

6.7.2.5 The rules are applied on creation only. Every digit stays editable afterwards under 6.11, and an edited profile is never rolled back towards what the tables would have produced.

6.7.3 The application stores the digits and reads them in two places: the detail values of 6.12 and the description of 6.13. Neither writes back, so the UWP stays user owned under 6.11.

6.8 The UWP and its detail values are inputs to generation. They say what kind of world this is; the seed says which particular one. Together they decide the surface, so the map is a picture of the UWP rather than a second opinion about it.

6.8.1 The dependency runs one way only. Generation reads the UWP and never writes to it, which is what keeps it user owned under 6.11. Regenerating the surface leaves every digit as the user left it.

6.9 The UWP and the map cannot disagree, because the map is generated from the UWP. Where a digit has no effect on the surface yet, that is a gap in what generation reads rather than a conflict to reconcile.

6.10 Narrative text is plain text. No markup, no formatting, and no rendering pass. There is no length limit, so the left panel field scrolls rather than cutting the user off, and the save format has to carry an arbitrarily long string.

6.11 The name, the two location fields of 6.14, the UWP, and narrative text are all user owned. Nothing in generation writes to them, and regenerating the surface leaves them all intact.

6.12 Positions that name a range get a detail value, which places the planet within that range. Size 1 covers 1000km to 1600km, so a detail value of 0.5 gives a diameter of 1300km. Change the digit to size 2 and the same 0.5 is read against 1600km to 3200km, giving 2400km.

6.12.1 A detail value is a fraction in [0, 1) fixed by the seed and the attribute's name, one named stream per attribute. Names rather than positions in a list, so adding an attribute later cannot shift the value of an existing one. Nothing is stored: a save carries the seed and the UWP, and the detail values are read off both on load.

6.12.2 The ranged positions and where their bands come from.

| Detail | From | Band |
| --- | --- | --- |
| Diameter | Size digit | The cheatsheet's diameter column, each entry the top of its digit's band. Digit 0 runs from 0. |
| Gravity | Size digit | The cheatsheet's gravity column, read the same way. Independent of the diameter fraction, so the pair stands in for density. |
| Pressure | Atmosphere digit | The cheatsheet gives one nominal figure per digit rather than a range, and repeats it across the tainted and untainted pairs. The bands are read around those nominals, and the digits marked "Varies" get the whole habitable spread. This is the one table that is an interpretation rather than a reading. |
| Surface water | Hydrographics digit | The cheatsheet's percentage ranges, used as they stand. |
| Population | Population digit | The digit is an exponent, so digit n covers 10^n up to the next power. Digit 0 is nobody rather than one person. |

6.12.3 Axial tilt is not one of these. It moved to the world settings of 6.15 when it gained a rotation, an orbit and a temperature to sit beside, since those four are one fact rather than four and belong in one place. What was here about how it is drawn is now 6.15.4.

6.12.4 Detail values are inputs to generation on the same terms as the digits they refine, under 6.8. Hydrographics reaches the map by setting sea level under 5.2.

6.13 The left panel shows a description in prose, built from the UWP digits and the detail values of 6.12. It is a view of what the user already has rather than new information, so it is rebuilt whenever a digit changes, never stored, and never in a save. An unreadable UWP says so rather than printing a description full of gaps.

6.14 Location follows Traveller convention: a sector, and a four digit hex within it. Two fields rather than one, because they are two different things and only one of them has a format to check.

6.14.1 The four digits are a column from 01 to 32 and a row from 01 to 40, which is the size of a sector chart. An entry outside that is not a square on any chart, and the field says so where it is rather than accepting it and hoping.

6.14.2 The subsector, A to P, is derived from the hex and never typed. The sixteen are a fixed carve-up of the chart, four across and four down, so a typed subsector could only agree with the hex or be wrong about it. It is shown under the field, along with the complaint of 6.14.1 when the entry is not a square on the chart. An empty field says nothing: the placeholder shows the shape of a hex, and the format is not worth a line of instructions to someone who either knows it or does not care.

6.14.3 This grid has nothing to do with the surface grid of section 2. A sector hex is one star system on a chart; a surface hex is a piece of ground on one planet. Nothing in generation reads either location field, so under 6.11 they stay user owned, and a world's place in the setting cannot change its terrain.

6.14.4 Saves written before this was settled carried a single free text location. Load splits one on a trailing four digit group, so a file that followed the convention by hand arrives in the two fields and one that did not keeps its text in the sector field. Nothing is discarded either way.


### 6.15 World settings

6.15 Five values sit beside the UWP: axial tilt, rotation period, orbital distance, mean surface temperature, and the number of impact craters the surface carries. They are rolled when the planet is created and the user can then type over any of them, which puts them on the left panel under 4.2.1.1 rather than on the summary panel with the detail values of 6.12.

6.15.1 They are one fact rather than four, and are worked out in the one order they can be. A world's orbit sets how much light it gets; the light and the air it holds set its temperature; how close in it sits sets how hard tides have worked on it, which decides both how fast it turns and how far its axis has been pulled upright. Deriving them in that order is what makes them consistent by construction instead of by luck: the model cannot produce a world locked to its sun with a 30° tilt and a twenty hour day, because a locked world is one tides have finished with and tides do not stop halfway on one axis.

6.15.2 The temperature is not stored. It is what the orbit implies, so moving the orbit carries it, and a temperature typed in is answered by moving the world to where it would be that warm. The two fields are one number seen twice and cannot be made to disagree. That is also why the reset of 4.2.1.2 has four settings to clear and not five.

6.15.3 An empty field is not a value of zero. It is the user withdrawing a decision, and the rolled figure comes back.

### What the UWP says about where a world sits

6.15.4 The UWP names no orbit, but it is evidence about one. The draw is made where the profile has something to say and inverted to get the orbit, rather than rolling an orbit and hoping it suits the digits.

6.15.4.1 Surface water under air worth the name has to be liquid water, or the hydrographics digit is describing ice and the figure is a lie. Such a world is drawn temperate.

6.15.4.2 Water under air too thin to hold heat is the Ice-Capped world of 5.4.3, and is drawn frozen.

6.15.4.3 Air the profile calls exotic, corrosive or insidious has run away, and those worlds are drawn hot. A runaway greenhouse is a state rather than a scaling, so it is a term added to the warming rather than a multiple of it: Venus is 500° above bare sunlight on 92 atmospheres, which no reading of a pressure curve reaches.

6.15.4.4 A world with no surface water is the case the profile cannot speak to, since a bare rock is as much at home scorched as frozen. Nothing is inferred and the orbit is drawn outright, log-uniformly, because orbits are spaced multiplicatively rather than evenly.

6.15.4.5 What cannot be read off a UWP at all is the star. A Sun-like one is assumed throughout, because the profile names none and a mainworld's usually is. The same world around an M dwarf would sit ten times closer and be locked, and that is the one figure here a referee is most likely to want to overrule.

6.15.4.6 Taken over a run of rolled worlds this lands the median at about an AU, 16°C, a twenty one hour day and a 26° tilt, which is very nearly Earth. That is not a target that was aimed at; it follows from most rolled profiles having water and air, and from those two digits between them fixing where a world has to be.

### Spin

6.15.5 Obliquity runs 0° to 180°: the angle between the spin axis and the orbit's. Past 90° the world is turning backwards rather than lying further over. The seasons run on how far the axis is from the plane of the orbit either way, so a world at 157° has the seasons of one at 23° run in the other direction. That folded figure is what 5.4.2 reads; the obliquity itself is what the panel shows and the globe leans by, since it carries the direction of spin as well.

6.15.6 The accretion result for obliquity is isotropic. The last few embryo-sized collisions set a world's spin and they arrive from any direction, so the axis points anywhere on the sphere: uniform in the cosine, half of all worlds retrograde, and 90° the likeliest tilt. The solar system is plainly not that, and the difference is what tides do afterwards.

6.15.6.1 So the draw is three populations. Worlds tides have settled sit within a couple of degrees of upright, as Mercury and Venus do. Of the rest, three in four keep the sense of the disc they formed in with a moderate nudge off it, spread so the middle of them lands near 23°, and the last in four are the isotropic draw in full, which is where a world thrown right over comes from.

6.15.6.2 Which population a world falls in is not a fixed share but the despin figure of 6.15.1, so the worlds whose axes tides pulled upright are the same worlds whose spin they slowed. This is the part that used to be a coincidence of proportions and is now a consequence.

6.15.7 Rotation starts fast. Simulations put a newly formed world at a few hours to a few tens of hours, and the solar system's undisturbed rotators all sit between 10 and 25. Tides slow it towards the world's own year, and how far along that road it has got is the same despin figure. The blend is made in the logarithm, since the two ends are three orders of magnitude apart and a straight average between them would mean nothing.

6.15.7.1 The falloff with distance is the sixth power, which is the tidal torque's own. That is why the transition is a near step rather than a slope, and why Mercury and Venus are settled while Earth, half again as far out as Venus, is barely touched.

### What the world settings shape

6.15.8 Temperature retires the proxy 5.4 was using. Polar ice used to read pressure, on the grounds that thick air is a greenhouse and nothing else on the sheet bore on how warm a world kept itself. There is a temperature now, worked out from the orbit and the air together, so the greenhouse is already inside the figure the ice reads and the proxy has nothing left to do.

6.15.9 Temperature also decides what the surface water is doing to the rock, which the hydrographics digit alone cannot say. A digit counts surface water without saying whether it flows: an ocean frozen to the bottom erodes nothing and one boiled off erodes nothing either. Between them the rate rises with temperature, since silicate weathering does.

6.15.9.1 Ice is not nothing. A temperate glacier is a more efficient tool than a river, so a world cold enough to be glaciated but warm enough for the ice to move is worn down hard rather than left alone. The curve therefore has a shoulder below freezing rather than a cliff at it, and only falls to nothing where the ice is too cold to flow.

6.15.10 Rotation sets how hard the wind blows, since spin drives the circulation. A fast rotator is windier and a world with its day locked to its year barely stirs. The effect is mild and logarithmic: the span from a six hour day to a locked one is three orders of magnitude, and what that does to rock is nothing like as much.

6.15.11 What none of them touch is relief, which stays gravity's under 3.4.2, or continent spread, which stays the seed's under 3.4.4.

### Craters

6.15.12 The crater count is the fifth setting, and it is the odd one out: it is not part of the chain of 6.15.1, since nothing about where a world sits says how often it was hit. It sits here rather than with the detail values of 6.12 for the reason the other four do - the seed rolls it and the referee may overrule it.

6.15.12.1 The roll is a band scaled by the erosion figure of 3.4.3, which is 3.6.2. The band is where the randomness lives: two airless rocks with identical profiles have not taken the same number of hits, and the profile has nothing to say about which, so the seed says instead.

6.15.12.2 An empty field returns the world to what the seed rolled, under 6.15.3. A typed zero is a different thing: a referee saying this world's record has been wiped, whatever its air and water work out to. The two are held apart the way the other settings hold them apart, so the field shows what the seed rolls alongside whatever has been typed over it.

6.15.12.3 The field is capped. Past twenty thousand the layer costs a fifth of a redraw at the finest level for a surface that saturated thousands of impacts earlier, so the ceiling sits where the pictures stop improving rather than where the arithmetic stops working. Under it the field shows how much ground is inside a rim, since a count alone does not say what a world looks like: a thousand small craters and a thousand large ones are different surfaces.

### 6.16 Trade classifications

6.16 The trade classifications are read off the UWP. Each is a test over the digits, so a world either meets one or it does not, and the same profile always earns the same list. Nothing is rolled and nothing is stored: the list is a view of the digits the user already has, as the description of 6.13 is.

6.16.1 They are worked out because the sector line of 6.18 carries them, and because a world sheet that gives the profile and not what it amounts to has left the reading to the reader.

6.16.2 The population multiplier, belts, and gas giants of a sector line are the one thing PlanetHex has nothing behind. No belt, gas giant, or population multiplier is anywhere in the surface or the profile. They are drawn from the seed rather than written as zeroes, so the same seed brings the same figures and anyone who wants different ones can type over them where they land. A world with nobody on it takes a multiplier of zero, since a tenth of nobody is still nobody.

### 6.17 Exporting the world

6.17 A save can also write the world in formats nothing in this application reads, for the tools that are not this application. The map images of 6.4.5 are pictures, and a picture cannot be queried, projected, styled, or put on a chart.

6.17.1 Every export describes the world at the detail level on screen rather than at all of them. A table of a level nobody is looking at is a table of a map nobody has, and the reader has the map in front of them.

6.17.1.1 A hex outline written in latitude and longitude has two problems a drawn hexagon does not, and both are dealt with on the way out. A hex straddling the antimeridian has corners at +179 and -179, which as a ring reads as a shape stretched round the whole world; its corners are brought within half a turn of the hex's own centre, which carries a few of them past 180. That is outside the range a coordinate is normally written in and is what mapping software wants: one unbroken ring, in the place the hex actually is. The two hexes on the poles have no outline that works at all, since the ring their corners make is a line across the top of the map rather than a cap over it; those two are closed over the pole itself.

6.17.2 GeoJSON, under RFC 7946. One feature per hex, the outline as its geometry, and the height, terrain, colour, and points of interest as its properties.

6.17.2.1 The collection carries which world it is as a foreign member, which the format allows and readers are asked to keep. A file that cannot say which world it is would have to be named carefully for ever after.

6.17.2.2 A point of interest sits where it was placed, which under 2.4.8 is a point far finer than any hex. It comes as its own point feature rather than as a property of the hex covering it, since the hex is the shape and the point is the point.

6.17.3 CSV, under RFC 4180. One row per hex, the header row, and the quoting the format asks for. A hex covering several points of interest is one row, since the row is about the hex, and their names are joined rather than one of them chosen: nothing written on the world is quietly dropped on the way out.

### 6.18 The sector line

6.18 The world as one line of a sector file, tab separated, with the header row the column format is identified by. A referee who has drawn a world usually wants it to appear on the sector map beside the others, and every tool that draws sector maps reads these columns.

6.18.1 The header travels with the line because a file without one is guessed at and a file with one is read. A separate block of comment lines above it says which world this is and what was left out, for somebody who did not export it.

6.18.2 Bases, travel zone, and stars are left blank rather than invented. PlanetHex describes the world, not the system it is in. Allegiance is the format's own placeholder for unaligned, which is what an unclaimed world is. PBG is the exception, under 6.16.2.

6.18.3 A world whose hex is not a square on the chart of 6.14 is written at 0000 rather than refused, so the line is still a line and the user can put it where it belongs.

### 6.19 The world sheet

6.19 One page about the world, in Markdown and in HTML. Everything else a save writes is the ground; this is the world as a referee reads it out at the table.

6.19.1 Two files rather than one because they are wanted in different places. The Markdown goes into a campaign wiki, a notes app, or a repository, where it is read as text and styled by whatever holds it. The HTML is for printing and for handing to a player, and carries its own styling, because a page that has to be paired with a stylesheet is a page that will be opened without one. Both are built from one description, so the two cannot drift apart.

6.19.2 The profile is spelled out a position at a time as well as read as prose. The paragraph of 6.13 is how a referee wants it at the table; a sheet somebody is going to print wants the same knowledge as a column they can run a finger down, lined up with the digits in the field above.

6.19.3 A section with nothing in it is left out rather than written empty. A world nobody has annotated has no points of interest, which is not the same as having a heading and a blank under it.

6.19.4 The HTML page is light rather than the panel's dark. It is meant to be printed, and a dark page prints as a black page.

### 6.20 The virtual tabletop scene

6.20 The map drawn at a hundred pixels to the hex, which is what a virtual tabletop starts a scene at, so it arrives at the size the grid expects rather than needing to be scaled before anything lines up. The width follows from the level, and is capped, since at the finest level it would be a picture no browser will encode and no tabletop will load.

6.20.1 A hex grid laid over it lines up within a face of the net and not across the seams between faces. That is what unfolding an icosahedron costs, and the manifest of 6.22 says so rather than leaving it to be discovered.

### 6.21 The equirectangular plate

6.21 The world drawn again with longitude across and latitude down. The hex map of section 4 is the world unfolded off an icosahedron, which is the right picture for a hex map and the wrong one for everything else: a globe texture, a projection in a mapping program, a terrain tool, and a tabletop showing the planet from orbit all want the layout nothing has to be told about.

6.21.1 Drawn pixel by pixel rather than hex by hex. Each pixel is a direction, the direction is placed on the icosahedron lattice, and the height is read between the lattice points around it. That is finer than any hex grid the application draws, so the plate shows the coastline the surface actually has rather than the hexes' idea of it. Reading the nearest lattice point instead would come out in triangular facets, which is the lattice showing through a picture that is not about the lattice.

6.21.2 Twice as wide as high, which is what the projection means, and the rows are sampled at their centres so a pole falls at the edge of the plate rather than half a row inside it.

6.21.3 Two plates. One is coloured as the map is coloured, so the sea, the ground, and the ice read as they do on screen. The other is grey, the height alone, for the tools that want to build the terrain themselves. The grey runs from the lowest a world can go to the highest, not from this world's own lowest to its own highest, so two worlds can be read against each other; where sea level falls is in the manifest of 6.22, since a grey value means nothing without it.

6.21.4 A plate is millions of pixels on the thread the panel draws on, so the thread is handed back often enough for the message saying how far along it is to reach the screen.

6.21.4.1 Handed back as a frame where there is a screen to reach, and as a plain turn where there is not. A browser stops giving frames to a tab nobody is looking at, and a save that stops the moment the user goes to another tab is worse than one that draws on quietly and is finished when they come back. The same holds for the images of 6.4.5.

### 6.22 The manifest

6.22 Where anything but the planet's own JSON is exported, a small manifest goes in with it. Several of the exports are pictures, and a picture cannot say what it is of: a grey pixel is a height only if you know where sea level sits, a scene is a hex grid only if you know how many pixels a hex is, and a plate is a world only if you know which world.

6.22.1 It holds which world it is, the detail level and hex count, the world's diameter and the kilometres a hex covers, sea level as both a height and a shade of grey, the plate's projection and extent, the scene's grid figures, and the names of the files written beside it.

### 6.23 Choosing what a save writes

6.23 Save opens a dialogue first. What goes in a save is the user's to choose: the map images of 6.4.5 at any of the levels of 2.2.2, and any of the formats of 6.17 to 6.21.

6.23.1 The planet's own JSON is not among the choices. A save without it is not a save of a planet, so it is always written, and it is what marks the planet saved.

6.23.2 The choices are grouped as the map images and everything else, and each carries a line saying who would want it. A format nobody can tell the use of is a format nobody ticks.

6.23.3 A format writes files and knows nothing about where they go. The folder of 6.4.1 and the archive of the fallback both take the same list, which is what keeps a save made in Chrome and a save made in Firefox holding the same files under the same names.

6.23.4 What was ticked is remembered between sessions, in the browser rather than in the planet. This is about the user and not about the world: somebody who wants GeoJSON wants it for every world they draw, and a planet handed to somebody else should not arrive telling them what to export. A browser that refuses storage loses the memory and nothing else.

6.23.5 The dialogue says how many files it is about to write, and says that the finest levels and the plate take a few seconds each. The moment to know that is while the ticks are still the user's to change.

6.23.6 The folder of 6.4.1.1 is asked for after the dialogue is dismissed rather than before it is opened, since the dialogue's own button is the gesture the picker needs and a picker cannot be opened from under a modal.

## 7. Reference material

> The files below are third party reference material, held for private use while building this application. They are not licensed for redistribution. Exclude the `Examples` folder from any public repository or published build, and do not copy their artwork, layout, or title blocks into the application. The folder is listed in `.gitignore`, so the links below resolve only in a local working copy.

Twenty triangles, 25 hexes each, 500 hexes total, at 430 miles per hex.

[ExampleMap1.jpg](Examples/ExampleMap1.jpg)

The same net at a different size, with generation controls along the top.

[ExampleMap2.png](Examples/ExampleMap2.png)

A one page UWP cheatsheet: the column order, the range of each position, and what the values mean. The source for 6.7.1.

[uwp.pdf](Examples/uwp.pdf)

The Traveller SRD at https://www.traveller-srd.com/, under core rules, world creation: the rolls, the modifiers, and the tables behind each digit. The source for 6.7.2. It is online and openly licensed, so unlike the files above it is neither held in the repository nor covered by the note at the head of this section.

## 8. Open questions

8.1 **Technology.** Rendering approach for the flat map, rendering approach for the sphere, and whether a framework is used at all. Unspecified so far.

8.2 **Sphere projection.** How the flat net maps onto the sphere, and how much distortion is acceptable near the 12 vertices.

8.3 **Terrain beyond height.** Both reference images show terrain types, ice, vegetation, and cities. Ice is settled under 5.4, which is the first thing drawn from latitude rather than from height. Vegetation and cities are still open, and so is whether anything else should be derived this way.

8.4 **Attachments.** No longer open. Settled in 6.5 as points of interest, of which there are two kinds: a starport, and a comment covering everything else a referee wants to write on a hex. What happens to one when the detail level changes is settled in 6.6. Whether cities become a kind of their own, or are generated from population the way 8.3 asks of vegetation, stays with 8.3.

8.5 **Location format.** No longer open. Settled in 6.14 as a sector plus a four digit hex, with the subsector derived from the hex. What a sector name should be checked against, if anything, is left alone: sector names belong to a setting rather than to the format.
