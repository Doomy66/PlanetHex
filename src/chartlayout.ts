/**
 * Where everything on a subsector chart goes. SubSectorSpec 2.1.2 and 4.2.
 *
 * The arithmetic only, with no drawing in it, because the chart is drawn twice:
 * once into the window as SVG elements the user can click, and once into a file
 * as SVG text nothing can click. Both have to put the same hex in the same
 * place, and the way to be sure of that is for neither of them to own the
 * answer.
 *
 * Columns of hexes, column 01 on the left, even columns sitting half a hex lower
 * than odd ones, row 01 at the top. This is the opposite convention from the
 * surface hexes of the planet spec section 2, and deliberately not shared with
 * them: a chart hex is one star system and a surface hex is a piece of ground on
 * one planet.
 */

import { SUB_COLS, SUB_ROWS } from "./location";

/**
 * A hex, in drawing units: HEX_WIDE corner to corner across, and flat topped, so
 * that columns can be offset against each other the way a Traveller chart offsets
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
 * key beside the chart saying which is which. 4.2.2.
 */
export const DOT = { least: 6, most: 12 } as const;
export const ZONE_R = 20;

/** How many colours the Mains are drawn in before they start round again. */
export const MAIN_COLOURS = 5;

/** How big a world's dot is. Population, not size: 4.2.1 says why. */
export function dotFor(population: number): number {
  const at = Math.min(1, Math.max(0, population / 12));
  return DOT.least + at * (DOT.most - DOT.least);
}

/** The middle of the hex at a column and row of the chart, in drawing units. */
export function centreOf(col: number, row: number): { x: number; y: number } {
  const x = PAD + (col - 1) * COLUMN_STEP + HEX_WIDE / 2;
  // Even columns ride half a hex lower, which is what makes a Traveller chart
  // read as columns of worlds rather than as a grid.
  const drop = col % 2 === 0 ? HEX_HIGH / 2 : 0;
  return { x, y: PAD + (row - 1) * HEX_HIGH + HEX_HIGH / 2 + drop };
}

/**
 * The six corners of a flat-topped hex about a centre.
 *
 * Written out rather than swept round in sixty degree steps, because a circle
 * sampled every sixty degrees and then squashed to the hex's height is not a
 * hexagon: the four slanted corners land short of the full height, and the chart
 * tiles with a gap down every seam. A flat-topped hex has its corners at the
 * ends of the horizontal axis and at a quarter of the width either side of the
 * middle, top and bottom.
 */
export function hexPoints(x: number, y: number): string {
  const wide = HEX_WIDE / 2;
  const quarter = HEX_WIDE / 4;
  const high = HEX_HIGH / 2;
  return [
    `${x + wide},${y}`,
    `${x + quarter},${y + high}`,
    `${x - quarter},${y + high}`,
    `${x - wide},${y}`,
    `${x - quarter},${y - high}`,
    `${x + quarter},${y - high}`,
  ].join(" ");
}

/** How big the whole chart is, in drawing units. */
export function chartSize(): { width: number; height: number } {
  return {
    width: PAD * 2 + (SUB_COLS - 1) * COLUMN_STEP + HEX_WIDE,
    height: PAD * 2 + SUB_ROWS * HEX_HIGH + HEX_HIGH / 2,
  };
}

/**
 * The hex numbers of a chart, by column and row, given where the subsector sits
 * on its sector.
 *
 * A chart is its own eight by ten whichever of the sixteen it is, and the hexes
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
