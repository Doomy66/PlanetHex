import { locate } from "../../grid/icosahedron";
import { isIced } from "../../gen/ice";
import { heightColour } from "../../ui/colour";
import { nextFrame, toPng } from "../images";
import type { Surface } from "../../surface";
import type { Vec3 } from "../../grid/vec3";

/**
 * The world as an equirectangular plate. Spec 6.21.
 *
 * The hex map of section 4 is the world unfolded off an icosahedron, which is the
 * right picture for a hex map and the wrong one for everything else. A globe
 * texture, a projection in a mapping program, a terrain tool, a virtual tabletop
 * showing the planet from orbit: all of them want longitude across and latitude
 * down, because that is the one layout nothing has to be told about.
 *
 * So this draws the same world again pixel by pixel rather than hex by hex. Each
 * pixel is a direction, the direction is placed on the icosahedron lattice, and
 * the height there is read off the field between the lattice points around it.
 * That is finer than any hex grid the application draws, so the plate shows the
 * coastline the surface actually has rather than the hexes' idea of it.
 *
 * Two plates come out of it. One is coloured as the map is coloured, so the sea,
 * the ground and the ice read the same as they do on screen. The other is grey,
 * the height alone, for the tools that want to build the terrain themselves.
 */

/** Twice as wide as high, which is what equirectangular means. Spec 6.21.2. */
export const PLATE_WIDTH = 2048;
export const PLATE_HEIGHT = PLATE_WIDTH / 2;

/**
 * Rows per face the field is read on. The finest the application draws is 96, and
 * the field is built to the power of two at or above that, so this is the whole of
 * the detail there is: asking for more would interpolate between points that were
 * never separately decided.
 */
const SAMPLE_SIZE = 128;

export interface PlateOptions {
  readonly width?: number;
  /** Reported through so a caller can say what it is drawing. */
  readonly onRow?: (row: number, rows: number) => void;
}

/**
 * The colour plate and the height plate, drawn in one pass over the pixels.
 *
 * One pass rather than two because placing a direction on the lattice is the
 * expensive part and both plates want the same answer for it. At the default
 * width that is two million placements, which is a second or so; doing it twice
 * would be two.
 */
export async function renderPlates(
  surface: Surface,
  options: PlateOptions = {},
): Promise<{ colour: Blob; height: Blob }> {
  const width = options.width ?? PLATE_WIDTH;
  const height = Math.round(width / 2);
  // Backed by a plain buffer rather than whatever the runtime would choose, for
  // the reason zip.ts spells out: ImageData will not take a view that might be
  // over shared memory.
  const pixels = () => new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const colourData = pixels();
  const heightData = pixels();
  const table = latticeTable(surface);

  // The colour ramp is read through a string and parsed back, which is what
  // heightColour hands out. There are far fewer distinct heights than pixels, so
  // the answers are kept: a plate has millions of pixels and a few thousand
  // colours, and parsing the same string a thousand times is wasted work.
  const cache = new Map<string, readonly [number, number, number]>();
  const rgb = (h: number, iced: boolean): readonly [number, number, number] => {
    const key = `${Math.round(h * 4096)}|${iced ? 1 : 0}`;
    const seen = cache.get(key);
    if (seen) return seen;
    const parsed = parseRgb(heightColour(h, surface.seaLevel, iced, surface.verdancy));
    cache.set(key, parsed);
    return parsed;
  };

  for (let y = 0; y < height; y++) {
    // The centre of the row, not its top edge: a row stands for a band of
    // latitude, and the pole belongs at the edge of the plate rather than half a
    // row inside it.
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
      const p: Vec3 = [cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)];
      const h = sample(table, p);
      const at = (y * width + x) * 4;
      const [r, g, b] = rgb(h, isIced(surface.caps, sinLat));
      colourData[at] = r;
      colourData[at + 1] = g;
      colourData[at + 2] = b;
      colourData[at + 3] = 255;
      // Straight from the generated height, so 0 is the lowest a world can go
      // and 255 the highest, whatever this world happens to reach. Sea level is
      // written into the manifest of 6.22, since a grey value means nothing
      // without it.
      const grey = Math.round(h * 255);
      heightData[at] = grey;
      heightData[at + 1] = grey;
      heightData[at + 2] = grey;
      heightData[at + 3] = 255;
    }
    // A plate is millions of pixels and the thread is the one the panel draws
    // on, so it is handed back often enough that the message saying how far
    // along this is can reach the screen. Spec 6.21.4.
    if ((y & 63) === 63) await nextFrame();
    options.onRow?.(y + 1, height);
  }

  return {
    colour: await encode(colourData, width, height),
    height: await encode(heightData, width, height),
  };
}

/** Points in one face's lattice of SAMPLE_SIZE rows. */
const FACE_POINTS = ((SAMPLE_SIZE + 1) * (SAMPLE_SIZE + 2)) / 2;

/** Index of lattice point (i, j) within one face's row-major array. */
const at = (i: number, j: number): number => (i * (i + 1)) / 2 + j;

/**
 * Every lattice height, flat, in the order the plate will ask for them.
 *
 * The field answers by position key, which means hashing a string per point. That
 * is the right trade for the tens of thousands of points a grid asks about, and
 * the wrong one for the millions a plate asks about: the same hundred and sixty
 * thousand answers would be looked up twelve times each. So they are all taken
 * once, into an array a pixel can index straight into.
 */
function latticeTable(surface: Surface): Float64Array {
  const table = new Float64Array(20 * FACE_POINTS);
  for (let face = 0; face < 20; face++) {
    const base = face * FACE_POINTS;
    for (let i = 0; i <= SAMPLE_SIZE; i++) {
      for (let j = 0; j <= i; j++) {
        table[base + at(i, j)] = surface.field.sample(face, i, j, SAMPLE_SIZE);
      }
    }
  }
  return table;
}

/**
 * The height at a direction, read between the lattice points around it.
 *
 * The field knows a height at each point of the lattice and nothing between them.
 * A plate asked for the nearest point instead would come out in triangular
 * facets, which is the lattice showing through a picture that is not about the
 * lattice. So the three points of the little triangle the direction falls in are
 * read and weighted by how near it is to each, which is the same interpolation
 * the relief view of 4.5.9 draws its ground with.
 */
function sample(table: Float64Array, p: Vec3): number {
  const found = locate(p, SAMPLE_SIZE);
  const i0 = Math.min(SAMPLE_SIZE - 1, Math.max(0, Math.floor(found.i)));
  const j0 = Math.min(i0, Math.max(0, Math.floor(found.j)));
  const u = clamp01(found.i - i0);
  const v = clamp01(found.j - j0);
  const base = found.face * FACE_POINTS;
  const corner = (i: number, j: number) => table[base + at(i, j)]!;

  // The lattice cell (i0, j0) to (i0+1, j0+1) is two triangles, and which of
  // them the point is in is decided by whether it has gone further along the row
  // than down the column. The column corner only exists where the row is wide
  // enough to hold it, which is exactly where this branch can be reached.
  const h =
    v > u
      ? (1 - v) * corner(i0, j0) + (v - u) * corner(i0, j0 + 1) + u * corner(i0 + 1, j0 + 1)
      : (1 - u) * corner(i0, j0) + (u - v) * corner(i0 + 1, j0) + v * corner(i0 + 1, j0 + 1);
  return h < 0 ? 0 : h > 1 ? 1 : h;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Pixels to a PNG, through a canvas, which is the only encoder a page has. */
async function encode(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the world to an image.");
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return toPng(canvas);
}

/** "rgb(r,g,b)" back to its three numbers. */
function parseRgb(colour: string): readonly [number, number, number] {
  const parts = colour.match(/\d+/g);
  if (parts === null || parts.length < 3) return [0, 0, 0];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}
