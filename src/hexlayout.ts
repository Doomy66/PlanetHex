/**
 * Where everything on a subsector map goes. SubSectorSpec 2.1.2 and 4.2.
 *
 * The arithmetic only, with no drawing in it, because the map is drawn twice:
 * once into the window as SVG elements the user can click, and once into a file
 * as SVG text nothing can click. Both have to put the same hex in the same
 * place, and the way to be sure of that is for neither of them to own the
 * answer.
 *
 * Columns of hexes, column 01 on the left, even columns sitting half a hex lower
 * than odd ones, row 01 at the top. This is the opposite convention from the
 * surface hexes of the planet spec section 2, and deliberately not shared with
 * them: a subsector hex is one star system and a surface hex is a piece of ground on
 * one planet.
 */

import { SUB_COLS, SUB_ROWS } from "./location";

/**
 * A hex, in drawing units: HEX_WIDE corner to corner across, and flat topped, so
 * that columns can be offset against each other the way a Traveller map offsets
 * them. A flat topped hex of that width stands the square root of three quarters
 * of it high, and its columns step three quarters of it apart.
 */
export const HEX_WIDE = 100;
export const HEX_HIGH = (HEX_WIDE * Math.sqrt(3)) / 2;
export const COLUMN_STEP = HEX_WIDE * 0.75;
export const PAD = HEX_WIDE * 0.45;

/**
 * The world itself, and the ring a travel zone puts round it. A world is drawn
 * as a dot, sized by population and coloured by what is on its surface, with the
 * key beside the map saying which is which. 4.2.2.
 */
export const DOT = { least: 6, most: 12 } as const;
export const ZONE_R = 20;

/**
 * A belt, as the scatter of rocks both maps draw it.
 *
 * Shared rather than written twice, because a belt that looked like a belt on
 * one map and like a world on the other would be the one thing these two
 * levels must not do. The offsets are in the units BELT_SPREAD measures, so a
 * map scales the whole cluster by whatever room it has: the subsector draws it
 * at its own size, and the sector draws it where a world's dot would go.
 */
export const BELT_ROCKS: readonly (readonly [number, number])[] = [
  [-6, -4],
  [5, -5],
  [0, 0],
  [-4, 5],
  [7, 3],
  [2, 7],
];

/** How far the furthest rock sits from the middle, and how big each one is. */
export const BELT_SPREAD = 7;
export const BELT_ROCK_R = 2;

/**
 * The marks beside a world: a naval base, a scout way station, a gas giant.
 *
 * The geometry only, so each map appends it with its own element maker. Shared
 * for the reason BELT_ROCKS is: one hex of one world should look the same
 * whichever level is drawing it.
 */
export const SYMBOL = {
  /** Bases sit to the left of the dot, a gas giant to the right. */
  basesLeft: -HEX_WIDE * 0.3,
  giantRight: HEX_WIDE * 0.27,
  giantUp: -4,
  /** Where each base goes when a world has both, rather than one in the middle. */
  bothUp: -8,
  bothDown: 9,
} as const;

/** The ten points of a naval base's star, round a centre. */
export function navalStar(x: number, y: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 7 : 3;
    const angle = (Math.PI / 180) * (i * 36 - 90);
    points.push(`${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`);
  }
  return points.join(" ");
}

/** The three points of a scout way station's triangle. */
export function scoutTriangle(x: number, y: number): string {
  return `${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`;
}

/** How big a gas giant's disc and ring are drawn. */
export const GIANT = { r: 4.5, rx: 8, ry: 2.6 } as const;

/** How many colours the Mains are drawn in before they start round again. */
export const MAIN_COLOURS = 5;

/** How big a world's dot is. Population, not size: 4.2.1 says why. */
export function dotFor(population: number): number {
  const at = Math.min(1, Math.max(0, population / 12));
  return DOT.least + at * (DOT.most - DOT.least);
}

/** The middle of the hex at a column and row of the subsector, in drawing units. */
export function centreOf(col: number, row: number): { x: number; y: number } {
  const x = PAD + (col - 1) * COLUMN_STEP + HEX_WIDE / 2;
  // Even columns ride half a hex lower, which is what makes a Traveller map
  // read as columns of worlds rather than as a grid.
  const drop = col % 2 === 0 ? HEX_HIGH / 2 : 0;
  return { x, y: PAD + (row - 1) * HEX_HIGH + HEX_HIGH / 2 + drop };
}

/**
 * The six corners of a flat-topped hex about a centre.
 *
 * Written out rather than swept round in sixty degree steps, because a circle
 * sampled every sixty degrees and then squashed to the hex's height is not a
 * hexagon: the four slanted corners land short of the full height, and the subsector
 * tiles with a gap down every seam. A flat-topped hex has its corners at the
 * ends of the horizontal axis and at a quarter of the width either side of the
 * middle, top and bottom.
 */
export function hexCorners(x: number, y: number): { x: number; y: number }[] {
  const wide = HEX_WIDE / 2;
  const quarter = HEX_WIDE / 4;
  const high = HEX_HIGH / 2;
  return [
    { x: x + wide, y },
    { x: x + quarter, y: y + high },
    { x: x - quarter, y: y + high },
    { x: x - wide, y },
    { x: x - quarter, y: y - high },
    { x: x + quarter, y: y - high },
  ];
}

export function hexPoints(x: number, y: number): string {
  return hexCorners(x, y)
    .map((corner) => `${corner.x},${corner.y}`)
    .join(" ");
}

/** How big the whole map is, in drawing units. */
export function hexMapSize(): { width: number; height: number } {
  return {
    width: PAD * 2 + (SUB_COLS - 1) * COLUMN_STEP + HEX_WIDE,
    height: PAD * 2 + SUB_ROWS * HEX_HIGH + HEX_HIGH / 2,
  };
}

/**
 * The hex numbers of a subsector, by column and row, given where the subsector sits
 * on its sector.
 *
 * A subsector is its own eight by ten whichever of the sixteen it is, and the hexes
 * carry sector-absolute numbers under 2.2.2 while the drawing does not.
 */
export function hexNumbers(firstCol: number, firstRow: number): string[][] {
  const acrossFrom = Math.floor((firstCol - 1) / SUB_COLS) * SUB_COLS;
  const downFrom = Math.floor((firstRow - 1) / SUB_ROWS) * SUB_ROWS;
  const rows: string[][] = [];
  for (let row = 1; row <= SUB_ROWS; row++) {
    const line: string[] = [];
    for (let col = 1; col <= SUB_COLS; col++) {
      line.push(
        `${String(acrossFrom + col).padStart(2, "0")}${String(downFrom + row).padStart(2, "0")}`,
      );
    }
    rows.push(line);
  }
  return rows;
}
