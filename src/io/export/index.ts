import { cellCount } from "../../grid/grid";
import { stepKm } from "../../ui/scale";
import { buildSurface, shaderFor } from "../../surface";
import { drawMap, renderMapAt, serialise, rasterise, WIDTH } from "../images";
import { hexRecords } from "./cells";
import { hexCsv } from "./csv";
import { hexGeoJson } from "./geojson";
import { PLATE_WIDTH, renderPlates } from "./plate";
import { sectorLine, sectorNotes } from "./sec";
import { worldSheetHtml, worldSheetMarkdown } from "./sheet";
import type { ViewMode } from "../../ui/colour";
import type { PlanetDetail } from "../../gen/detail";
import type { Planet } from "../../planet";

/**
 * The export formats, and what each of them writes. Spec 6.17 to 6.22.
 *
 * A save has always written the planet and its pictures. What it could not do was
 * hand the world to anything else: a picture is a picture, and a referee who
 * wanted the coastline in a mapping program, the profile on a sector chart, or
 * the ground under a virtual tabletop had nothing to give them. These are that.
 *
 * Every format is described here rather than wired into the save, so the dialogue
 * of 6.23 can list them, remember which were ticked, and write only those. A
 * format produces files and knows nothing about where they go: the folder of
 * 6.4.1 and the archive of the fallback both take the same entries.
 */

/** A file a save is to write, named without its planet stem. */
export interface ExportFile {
  /** What goes after the planet's name, extension included: "-48.svg". */
  readonly suffix: string;
  readonly data: string | Blob;
}

/** Everything a format needs to know about the world being written out. */
export interface ExportContext {
  readonly planet: Planet;
  readonly detail: PlanetDetail;
  /** The detail level on screen, which is the level the data formats describe. */
  readonly size: number;
  /** Whether the hex seams are off, as 4.3.7.1 has them on screen. */
  readonly smooth: boolean;
  /** Which of the two views of 5.7 is on screen. What is written out is what
   *  was being looked at, the way the seams above already are. */
  readonly view: ViewMode;
  /** Somewhere to say what is being drawn, for the formats that take a while. */
  readonly say: (message: string) => void;
}

export interface ExportFormat {
  readonly id: string;
  /** What the dialogue calls it. */
  readonly label: string;
  /** The line under it, saying who would want it. */
  readonly note: string;
  /** Which part of the dialogue it is listed under. Spec 6.23.2. */
  readonly group: "map" | "data" | "table";
  /** Ticked on a first run. The rest are there for the asking. */
  readonly byDefault: boolean;
  /** How many files it writes, so the dialogue can count before it runs. */
  readonly files: number;
  produce(context: ExportContext): Promise<ExportFile[]>;
}

/**
 * The surface at the level being exported, built once per save rather than once
 * per format. Four of the formats below want the same one, and building it is the
 * most expensive thing the application does.
 */
function surfaceOnce(context: ExportContext) {
  return buildSurface(context.planet, context.detail, context.size);
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  {
    id: "svg",
    label: "Vector map (SVG)",
    note: "The hex map as lines rather than pixels. Prints at any size and opens in Inkscape, Illustrator or Affinity.",
    group: "map",
    byDefault: false,
    files: 1,
    async produce(context) {
      const drawing = drawMap(
        context.planet,
        context.detail,
        context.size,
        context.smooth,
        context.view,
        WIDTH,
        surfaceOnce(context),
      );
      return [{ suffix: `-${context.size}.svg`, data: text(serialise(drawing), "image/svg+xml") }];
    },
  },
  {
    id: "plate",
    label: "Equirectangular plate and heightmap (PNG)",
    note: "Longitude across, latitude down: the layout a globe texture, a terrain tool or a mapping program expects. The grey one is height alone.",
    group: "map",
    byDefault: false,
    files: 2,
    async produce(context) {
      context.say("Drawing the equirectangular plate...");
      const surface = surfaceOnce(context);
      const plates = await renderPlates(surface, shaderFor(surface, context.view), {
        onRow: (row, rows) => {
          if (row % 128 === 0) context.say(`Drawing the equirectangular plate, row ${row} of ${rows}...`);
        },
      });
      return [
        { suffix: "-plate.png", data: plates.colour },
        { suffix: "-heightmap.png", data: plates.height },
      ];
    },
  },
  {
    id: "vtt",
    label: "Virtual tabletop scene (PNG)",
    note: "The map at a hundred pixels to the hex, with the grid figures a Foundry or Roll20 scene asks for written beside it.",
    group: "map",
    byDefault: false,
    files: 1,
    async produce(context) {
      const width = vttWidth(context.size);
      context.say("Drawing the tabletop scene...");
      const png = await renderMapAt(
        context.planet,
        context.detail,
        context.size,
        context.smooth,
        context.view,
        width,
      );
      return [{ suffix: "-vtt.png", data: png }];
    },
  },
  {
    id: "geojson",
    label: "Hex polygons (GeoJSON)",
    note: "Every hex as a shape in latitude and longitude, with its height and terrain. Opens in QGIS, Leaflet, and anything that reads GeoJSON.",
    group: "data",
    byDefault: false,
    files: 1,
    async produce(context) {
      const surface = surfaceOnce(context);
      return [
        {
          suffix: `-${context.size}.geojson`,
          data: text(
            hexGeoJson(hexRecords(surface, context.planet.pois, shaderFor(surface, context.view)), {
              planet: context.planet,
              size: context.size,
              seaLevel: surface.seaLevel,
              diameterKm: surface.diameterKm,
            }),
            "application/geo+json",
          ),
        },
      ];
    },
  },
  {
    id: "csv",
    label: "Hex table (CSV)",
    note: "One row per hex: name, latitude, longitude, height, terrain, and whatever sits on it. For spreadsheets and for scripts.",
    group: "data",
    byDefault: false,
    files: 1,
    async produce(context) {
      const surface = surfaceOnce(context);
      return [
        {
          suffix: `-${context.size}.csv`,
          data: text(
            hexCsv(hexRecords(surface, context.planet.pois, shaderFor(surface, context.view))),
            "text/csv",
          ),
        },
      ];
    },
  },
  {
    id: "sec",
    label: "Traveller sector line (T5 tab separated)",
    note: "The world as one line of a sector file, trade codes worked out, ready to paste in among its neighbours.",
    group: "table",
    byDefault: false,
    files: 1,
    async produce(context) {
      return [
        {
          suffix: ".sec",
          data: text(
            `${sectorNotes(context.planet)}${sectorLine(context.planet)}`,
            "text/tab-separated-values",
          ),
        },
      ];
    },
  },
  {
    id: "sheet",
    label: "World sheet (Markdown and HTML)",
    note: "One page about the world: the profile spelled out, the figures, the prose, and every point of interest. The HTML prints.",
    group: "table",
    byDefault: false,
    files: 2,
    async produce(context) {
      const input = {
        planet: context.planet,
        detail: context.detail,
        size: context.size,
        cells: cellCount(context.size),
      };
      return [
        { suffix: ".md", data: text(worldSheetMarkdown(input), "text/markdown") },
        { suffix: "-sheet.html", data: text(worldSheetHtml(input), "text/html") },
      ];
    },
  },
];

/**
 * How wide the tabletop scene is drawn. A hundred pixels to the hex is what a
 * virtual tabletop starts a scene at, so the map arrives at the size the grid
 * expects rather than needing to be scaled before anything lines up.
 *
 * The net is `size` hexes along a face edge and five face edges across, so the
 * width follows from the level. It is capped, because at the finest level that
 * would be a picture no browser will encode and no tabletop will load.
 */
export const VTT_HEX_PX = 100;
const VTT_MAX_WIDTH = 8192;

export function vttWidth(size: number): number {
  return Math.min(VTT_MAX_WIDTH, Math.round(size * 5 * VTT_HEX_PX));
}

/**
 * The manifest. Spec 6.22.
 *
 * Several of the formats above are pictures, and a picture cannot say what it is
 * of. A grey pixel is a height only if you know where sea level sits; a scene is
 * a hex grid only if you know how many pixels a hex is; a plate is a world only
 * if you know which world. So one small file goes in beside them saying all of it,
 * and it is written whenever anything but the planet's own JSON is.
 */
export function manifest(context: ExportContext, files: readonly string[]): string {
  const surface = buildSurface(context.planet, context.detail, context.size);
  const width = vttWidth(context.size);
  return JSON.stringify(
    {
      application: "PlanetHex",
      planet: {
        name: context.planet.name,
        uwp: context.planet.uwp,
        seed: context.planet.seed,
        sector: context.planet.sector,
        hex: context.planet.hex,
      },
      world: {
        detail: context.size,
        // Which of the two views of 5.7 the coloured files were drawn in. A grey
        // plate is a dead world in one of them and a matter of altitude in the
        // other, and nothing in the picture itself says which. The heightmap and
        // the sector line carry no colour and are the same either way.
        view: context.view,
        hexes: cellCount(context.size),
        diameterKm: surface.diameterKm,
        kmPerHex: surface.diameterKm === null ? null : stepKm(surface.diameterKm, context.size),
        // The one figure a heightmap cannot carry and cannot be read without.
        seaLevel: surface.seaLevel,
        seaLevelGrey: Math.round(surface.seaLevel * 255),
      },
      plate: {
        projection: "equirectangular",
        width: PLATE_WIDTH,
        height: PLATE_WIDTH / 2,
        longitude: [-180, 180],
        latitude: [90, -90],
      },
      vtt: {
        // Enough for a scene to be set up without measuring anything. The grid
        // lines up within a face of the net and not across the seams between
        // them, which is what unfolding an icosahedron costs and is said here
        // rather than left to be discovered.
        width,
        hexPixels: Math.round(width / (context.size * 5)),
        gridType: "hexagonal",
        alignedWithinFacesOnly: true,
      },
      files: [...files].sort(),
    },
    null,
    2,
  );
}

/** A string as a blob of its own type, so what is written carries what it is. */
function text(body: string, type: string): Blob {
  return new Blob([body], { type: `${type};charset=utf-8` });
}

export { hexRecords } from "./cells";
export { rasterise };
