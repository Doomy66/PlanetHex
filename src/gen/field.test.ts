import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { generateHeights } from "./height";
import { buildHeightField, fieldSizeFor } from "./field";
import { DEFAULT_SEA_LEVEL } from "../ui/colour";

const SEEDS = ["Damadas", "Regina", "Vland", "Terra"];

/** Separate stretches of land, and how much of the surface is coastline. */
function features(size: number, seed: string) {
  const grid = buildGrid(size);
  const h = generateHeights(grid, seed);
  const land = (id: number) => h[id]! > DEFAULT_SEA_LEVEL;
  const seen = new Set<number>();
  let masses = 0;
  for (const cell of grid.cells) {
    if (!land(cell.id) || seen.has(cell.id)) continue;
    masses++;
    const stack = [cell.id];
    seen.add(cell.id);
    while (stack.length) {
      for (const n of grid.cells[stack.pop()!]!.neighbours) {
        if (land(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  }
  return { grid, heights: h, masses };
}

describe("height field", () => {
  it("uses a lattice at least as fine as the grid", () => {
    expect(fieldSizeFor(1)).toBe(1);
    expect(fieldSizeFor(7)).toBe(8);
    expect(fieldSizeFor(8)).toBe(8);
    expect(fieldSizeFor(9)).toBe(16);
  });

  it.each([1, 2, 3, 5, 7, 8, 11, 16])("gives every cell a real height at size %i", (size) => {
    const grid = buildGrid(size);
    const heights = generateHeights(grid, "coverage");
    expect([...heights].filter((h) => !Number.isFinite(h))).toEqual([]);
  });

  // The far edge of a face samples the point one step beyond the lattice. That
  // point carries zero weight, but reading past the array turned the sum to NaN.
  it("samples the far corners of a face without running off the lattice", () => {
    const field = buildHeightField("Damadas", 8);
    for (let f = 0; f < 20; f++) {
      for (const [i, j] of [[0, 0], [8, 0], [8, 8], [8, 4], [4, 4]] as const) {
        expect(Number.isFinite(field.sample(f, i, j, 8))).toBe(true);
      }
    }
  });

  // The seed fixes the world; the size only fixes how finely it is sampled. The
  // twelve corner cells are level 0 points, so they must not move at all.
  it.each(SEEDS)("keeps the same world at every size for seed %s", (seed) => {
    const reference = new Map<string, number>();
    for (const size of [2, 4, 7, 8, 16]) {
      const grid = buildGrid(size);
      const heights = generateHeights(grid, seed);
      for (const cell of grid.cells) {
        if (!cell.isPentagon) continue;
        const key = cell.centre.map((v) => v.toFixed(4)).join(",");
        const previous = reference.get(key);
        if (previous === undefined) reference.set(key, heights[cell.id]!);
        else expect(heights[cell.id]!).toBeCloseTo(previous, 9);
      }
    }
    expect(reference.size).toBe(12);
  });

  // The bug this guards against: a larger grid that only interpolates the coarse
  // shape, so the map gains hexes without gaining anything to look at.
  it.each(SEEDS)("adds real detail as the grid grows for seed %s", (seed) => {
    const coarse = features(4, seed);
    const fine = features(16, seed);
    expect(fine.masses).toBeGreaterThan(coarse.masses);
  });

  it("does not saturate the colour ramp", () => {
    for (const seed of SEEDS) {
      const grid = buildGrid(16);
      const heights = generateHeights(grid, seed);
      const clamped = [...heights].filter((h) => h === 0 || h === 1).length;
      expect(clamped / heights.length).toBeLessThan(0.02);
    }
  });
});
