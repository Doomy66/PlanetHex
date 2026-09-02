import type { CellId, Grid } from "../grid/grid";

/**
 * Where to put the starport of a new world. Spec.md 6.5.8.
 *
 * A starport is built where people are, and on a world drawn only as height that
 * means the coast: ships come down beside water, on ground large enough to hold a
 * town, as near the equator as that allows. Nothing here reads the population
 * digit, because nothing in the surface says where the people are; this is the
 * best guess the terrain alone supports, and the user can move it.
 */

/**
 * How much being on a small landmass costs, in the same units as the equator
 * measure below. The measure is the sine of the latitude, so 0.35 is worth about
 * 20 degrees: a continent well placed beats a bigger one further north, and an
 * islet does not beat either.
 */
const ISLAND_COST = 0.35;

export interface Site {
  readonly cell: CellId;
  /** True where the site is land with sea against it, which is what is wanted. */
  readonly coastal: boolean;
}

/**
 * The best landing site on a world, or null for a grid with no cells.
 *
 * Coastal land is preferred, then land, then anywhere: an ocean world still gets
 * a starport, because a world without one is a decision for the profile to make
 * rather than for the terrain.
 */
export function starportSite(
  grid: Grid,
  heights: Float64Array,
  seaLevel: number,
): Site | null {
  if (grid.cells.length === 0) return null;
  const isLand = (id: CellId) => heights[id]! > seaLevel;
  const landmass = landmasses(grid, isLand);
  const largest = Math.max(1, ...landmass.size);

  let best: Site | null = null;
  let bestBand = Infinity;
  let bestScore = Infinity;
  for (const cell of grid.cells) {
    const land = isLand(cell.id);
    const coastal = land && cell.neighbours.some((n) => !isLand(n));
    // Coastal land beats plain land beats sea, whatever the score within a band,
    // so the ranking cannot trade the coast away for a few degrees of latitude.
    const band = coastal ? 0 : land ? 1 : 2;
    if (band > bestBand) continue;
    // The centre is a unit vector, so its y is the sine of the latitude: zero at
    // the equator and one at a pole.
    const score =
      Math.abs(cell.centre[1]) +
      (land ? (1 - landmass.size[landmass.of[cell.id]!]! / largest) * ISLAND_COST : 0);
    if (band < bestBand || score < bestScore) {
      best = { cell: cell.id, coastal };
      bestBand = band;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The connected land bodies, as an index per cell and a size per body. Two land
 * cells are the same landmass when they are neighbours, which is what makes a
 * continent one thing and an island chain several.
 */
export function landmasses(
  grid: Grid,
  isLand: (id: CellId) => boolean,
): { of: readonly number[]; size: readonly number[] } {
  const of = new Array<number>(grid.cells.length).fill(-1);
  const size: number[] = [];
  for (const cell of grid.cells) {
    if (of[cell.id] !== -1 || !isLand(cell.id)) continue;
    const body = size.length;
    let count = 0;
    // Iterative, since a continent at detail 48 runs to thousands of cells and
    // recursion over it is a stack overflow rather than a landmass.
    const queue: CellId[] = [cell.id];
    of[cell.id] = body;
    while (queue.length > 0) {
      const id = queue.pop()!;
      count++;
      for (const n of grid.cells[id]!.neighbours) {
        if (of[n] === -1 && isLand(n)) {
          of[n] = body;
          queue.push(n);
        }
      }
    }
    size.push(count);
  }
  return { of, size };
}
