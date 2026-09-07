import type { Grid } from "../grid/grid";
import { latticePosition, REFERENCE_SIZE } from "../grid/coord";
import { positionKey } from "../grid/vec3";
import type { HeightField, HeightFieldOptions } from "./field";
import { buildHeightField, DEFAULT_FIELD_OPTIONS } from "./field";

/**
 * Heights for a grid, read off the subdivision field in field.ts.
 *
 * The field is built to the same depth whatever the detail level, so the detail
 * level decides how finely the world is sampled and nothing else. Spec 3.2.4.
 * Changing detail therefore cannot move a coastline or raise a mountain: every
 * cell the two levels share reads the same height, and the cells only one of them
 * draws were always there to be drawn. The seed and the UWP decide what the world
 * is; detail decides how much of it is on screen.
 */

export type HeightOptions = HeightFieldOptions;
export const DEFAULT_HEIGHT_OPTIONS = DEFAULT_FIELD_OPTIONS;

export function generateHeights(
  grid: Grid,
  seed: string,
  options: HeightOptions = DEFAULT_FIELD_OPTIONS,
): Float64Array {
  return heightsOn(buildHeightField(seed, REFERENCE_SIZE, options), grid);
}

/**
 * The same, off a field already built.
 *
 * Building the field is most of the work and is the same work whatever grid is
 * being sampled, so a caller wanting two grids of one world - the display grid and
 * the finest grid the globe of 4.4.9 draws - reads them both off one field rather
 * than paying for it twice.
 */
export function heightsOn(field: HeightField, grid: Grid): Float64Array {
  // NaN marks a cell nothing has written to, so a gap shows up as a gap rather
  // than as a plausible sea-level zero.
  const heights = new Float64Array(grid.cells.length).fill(Number.NaN);

  for (const face of grid.net) {
    for (const p of face.placements) {
      if (!Number.isNaN(heights[p.cell]!)) continue;
      heights[p.cell] = clamp01(field.sample(face.face, p.i, p.j, grid.size));
    }
  }
  return heights;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Every distinct height on the reference lattice, which is what sea level is read
 * off. Spec 5.2.4.
 *
 * Taking the quantile from the cells on screen would make the coastline depend on
 * how many are on screen, and the whole point of a fixed field is that it does
 * not. So the fraction is measured against the reference lattice at every detail
 * level, and the coastline sits in the same place on all four.
 *
 * The grid is not built to do it. Only the sample values are wanted, and a face
 * lattice walked directly gives those without the neighbour sets and outlines a
 * grid of 23042 cells would carry.
 */
export function referenceHeights(
  seed: string,
  options: HeightOptions = DEFAULT_FIELD_OPTIONS,
): Float64Array {
  return referenceHeightsOn(buildHeightField(seed, REFERENCE_SIZE, options));
}

/** The same, off a field already built, for the reason heightsOn gives. */
export function referenceHeightsOn(field: HeightField): Float64Array {
  const seen = new Set<string>();
  const values: number[] = [];
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i <= REFERENCE_SIZE; i++) {
      for (let j = 0; j <= i; j++) {
        // Seams and corners are produced by every face that meets there, and a
        // point counted twice would weight that part of the world twice.
        const key = positionKey(latticePosition(f, REFERENCE_SIZE, i, j));
        if (seen.has(key)) continue;
        seen.add(key);
        values.push(clamp01(field.sample(f, i, j, REFERENCE_SIZE)));
      }
    }
  }
  return Float64Array.from(values);
}

/**
 * The sea level that puts the wanted fraction of the surface under water. Spec 5.2.
 *
 * The heights are what the seed produced and are never touched; only the line
 * drawn across them moves. So a hydrographics digit of 3 and a digit of 8 give the
 * same terrain with a different coastline, rather than two different worlds.
 */
export function seaLevelFor(heights: Float64Array, wetFraction: number): number {
  const wanted = wetFraction < 0 ? 0 : wetFraction > 1 ? 1 : wetFraction;
  const sorted = Float64Array.from(heights).sort();
  const count = Math.round(wanted * sorted.length);
  // Below every height, so nothing is sea. -1 rather than 0, since a height of
  // exactly 0 is dry land on a world with no water.
  if (count === 0) return -1;
  return sorted[count - 1]!;
}

/** Fraction of the surface at or below sea level. */
export function seaCoverage(heights: Float64Array, seaLevel: number): number {
  let wet = 0;
  for (const h of heights) if (h <= seaLevel) wet++;
  return wet / heights.length;
}
