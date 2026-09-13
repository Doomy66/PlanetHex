# PlanetHex

Generates a planet surface from a seed and shows it two ways at once: as a flat
Traveller-style hex map on the unfolded icosahedral net, and as a globe that
turns on its own axis.

Nothing about the surface is stored. A planet is a seed, a Universal World
Profile, and whatever the user has written on it, so the whole world travels as
a short piece of JSON and is rebuilt on load.

## Claude
I have 50 years of hand coding, I even reproduced the Spinward Marches on my 
ZX-Spectrum, so I have earned the right and have the skills to use AI. 
At time 
of writing, this is 100% Claude generated to my exacting requirements.

## What it does

- **One world, two views.** The map and the globe read the same height field, so
  a coastline on one is the coastline on the other.
- **Four detail levels.** 6, 12, 24, and 48 rows to a face, giving 362 to 23,042
  hexes. The field is always built to the depth the finest level needs, so
  raising the level resolves the same world more finely rather than producing a
  different one.
- **A third panel below the globe** draws the selected hex and the ground around
  it several subdivisions deeper than the map can resolve, and that is where a
  place on the world gets put.
- **The UWP shapes the surface.** Gravity sets the relief, air and water weather
  it, hydrographics sets sea level, axial tilt and pressure size the ice caps,
  and the whole profile is rolled to Traveller's world creation rules and then
  editable digit by digit.
- **Two ways to look at it.** The **Orbital** view, which is where a new world
  opens, says what colour the ground would be coming in: green where things grow,
  brown where the ground is bare but weathered, grey where it is bare rock, white
  where water is frozen. It reads temperature rather than height, so a world is
  jungle at its equator and tundra near its poles, with dry belts in the
  subtropics — and the axial tilt decides how far apart those latitudes run. Lean
  the axis past 54° and the poles take more sun over a year than the equator does,
  and the world comes out iced at the waist and green at the ends. All three panels
  follow the choice, and so does everything a save writes with colour in it. The
  **Survey** view is the other one: height as colour, blue through ground to grey
  and white peaks, for when what you want to know is how high something is.
- **Craters, where the world kept them.** Impacts are laid over the height field
  as a layer of their own, so the same crater is on the map, on the globe and in
  the local panel. How many a world carries is rolled from its seed and then
  scaled by how much weather has been rubbing them out: an airless rock keeps its
  whole record and an Earth keeps none. The count is a world setting, so it can be
  typed over and reset with the rest.
- **Points of interest.** Starports, cities and comments, each with a name and
  free prose, pinned to a hex by a name that survives a change of detail level. A
  new world arrives with the starport its profile says it has, placed on coastal
  land near the equator.
- **Cities where people would actually live.** One settlement per point of the
  population digit, the starport counting as the first of them, sited where the
  ground is worth living on — where things grow, on a coast, off the mountains
  and the ice — and spread out rather than heaped in one bay. A world with no
  land puts them on the water. Each carries its share of the world's people in
  its notes, by the rank-size rule, and those shares deliberately do not total
  the world: plenty of people live outside a city, and on a world with a good
  starport plenty live in orbit.
- **Every hex knows what it is made of.** Rainforest, steppe, cold desert, sea
  ice, bare rock. Not the same question as how high the ground is, so the readout
  and the exports carry both: two hexes at one height, one at the equator and one
  at sixty degrees, are the same terrain and quite different ground.
- **Saving** writes a folder holding the planet's JSON and whatever else you
  ticked: the flat map as a PNG at any of the five detail levels, and any of the
  export formats below. On a browser without the File System Access API the same
  files arrive as one zip download instead. No server is involved either way, and
  nothing leaves the machine.
- **Exports** for the tools that are not PlanetHex: the map as SVG, an
  equirectangular plate and a grey heightmap, a virtual tabletop scene, the hexes
  as GeoJSON polygons or a CSV table, a Traveller sector line with its trade
  codes worked out, and a printable world sheet in Markdown and HTML.

Every hex has a stable name of the form `F07R33C08` — face, row, and column
counted on the finest lattice — so a hex can be written in a save file or read
out at the table.

## Running it

```bash
npm install
npm run dev
```

Then open the address Vite prints. Every browser with WebGL runs the
application; the two save paths differ.

| Browser | Save | Load |
| --- | --- | --- |
| Chrome, Edge | Writes a folder in place, and rewrites it on the next Save. | Opens the planet's JSON through the file picker. |
| Firefox, Safari | Downloads the same files as one zip. Each Save is a new file. | Opens either the zip or the JSON inside it. |

The difference is the File System Access API, which is Chromium only. Where it
is missing the application says so on the status line rather than failing at the
moment the user clicks Save.

For the desktop build:

```bash
npm run desktop
```

That builds the static bundle and opens it in Electron, which serves it over a
custom `app://` scheme so the page has a real origin.

`npm run package` produces a Windows installer, `PlanetHex-Setup-<version>.exe`.
It installs per user, so it needs no administrator, and it puts nothing outside
the user's own profile. The output goes to `%LOCALAPPDATA%/PlanetHex/release`
unless `PLANETHEX_OUT` names somewhere else; the project's own drive is ReFS,
which electron-builder cannot package onto, so the build has to land elsewhere.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. |
| `npm run build` | Type check, then build into `dist/`. |
| `npm test` | Run the test suite once. |
| `npm run test:watch` | Run it on every change. |
| `npm run desktop` | Build, then open the desktop shell. |
| `npm run icon` | Regenerate `build/icon.ico` from `build/icon.svg`. |
| `npm run sidebar` | Regenerate the installer's sidebar image. |
| `npm run package` | Build the Windows installer. |

## Layout

| Path | Holds |
| --- | --- |
| `src/grid/` | The icosahedral grid: coordinates, neighbours, hex geometry, and picking. |
| `src/gen/` | Generation: the height field, climate, ice, life, biomes, craters, tilt, settlement siting, and the world description. |
| `src/ui/` | The three panels: flat map, globe, local detail, plus colour and scale bars. |
| `src/io/` | Save, load, the map images, and the export formats in `src/io/export/`. |
| `electron/` | The desktop shell and its packaging script. |
| `Spec.md` | The specification. Every decision, and why. |
| `CHANGELOG.md` | What changed in each release, and what it was for. |

## The specification

[Spec.md](Spec.md) is the authority on behaviour, and it is numbered so the code
can cite it. Sub-clauses carry the reasoning: why the detail slider is safe to
move, why a hex on a seam belongs to both faces, why the ice-capped trade code
is a floor and not a gate. Read it before changing anything about the grid or
the field.

Reference material used while building — the example maps and the UWP
cheatsheet — is third party and held for private use only. It sits in
`Examples/`, which is excluded from the repository.

[CHANGELOG.md](CHANGELOG.md) is the other half of the record: the spec says what
the application does now, and the changelog says when each piece of it arrived
and what it was for.

## Built with

TypeScript, Vite, three.js for the globe, SVG for the map and the local patch,
Vitest for the tests, and Electron for the desktop build.

## Publishing it

`npm run build` produces `dist/`, which is the whole application: a few hundred
kilobytes of static files with no server behind them and no backend to run. It
can be served from any static host, and `base` is relative in
[vite.config.ts](vite.config.ts) so a subdirectory works as well as a root.

Serve it over HTTPS. The File System Access API is refused outside a secure
context, so the folder save of 6.4.1 would fall back to the zip on every
browser without it.

Nothing is collected, stored, or sent anywhere. A planet is a seed, a UWP, and
whatever the user has written on it, and all three stay in the tab until the
user saves them.

## Licence

MIT, see [LICENSE](LICENSE). The application icon is derived from a
[Tabler](https://tabler.io/icons) icon, also MIT, whose notice travels with the
packaged build as `LICENSE-tabler-icons.txt`.

PlanetHex generates worlds by the procedure in the Traveller SRD: the Universal
World Profile, the order the digits are rolled in, the modifiers each takes from
the ones before it, and the trade classifications read off the result. That
procedure is expressed here as code rather than copied as text. No text, table,
artwork, form, or map from any Traveller publication is reproduced, and no
setting material — no sector, subsector, world, or name from the Third Imperium
— ships with the application.

Traveller is a trademark of Far Future Enterprises. PlanetHex is an independent
tool, not affiliated with, licensed by, or endorsed by Far Future Enterprises,
Mongoose Publishing, or any other Traveller publisher.
