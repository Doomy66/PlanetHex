# Version history

The version in [package.json](package.json) is what the Windows installer of
`npm run package` names itself after, so it is the one number that reaches a
user. Dates are the day the release was tagged.

## Unreleased

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
  fraction of one, and nothing else in the application pays for it: the globe
  keeps its own level and so does the lattice sea level is measured on.
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
