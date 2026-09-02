import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { buildRefIndex, DETAIL_LEVELS, REFERENCE_SIZE } from "../grid/coord";
import { generateHeights, referenceHeights, seaLevelFor } from "./height";
import { fieldOptionsFor } from "./shape";
import { planetDetail } from "./detail";

/**
 * The property the detail slider exists to have. Spec 3.2.4 and 2.4.
 *
 * Changing the detail level must not change the world. A hex drawn at two levels
 * carries one height, and the coastline sits in one place, so coarsening the map
 * takes hexes away rather than rewriting the ones that remain.
 */

const SEED = "TESTWRLD";

describe("detail levels", () => {
  it("gives a shared hex the same height at every level that draws it", () => {
    const byName = new Map<string, number>();
    for (const level of DETAIL_LEVELS) {
      const grid = buildGrid(level);
      const heights = generateHeights(grid, SEED);
      const index = buildRefIndex(grid);
      for (let id = 0; id < grid.cells.length; id++) {
        const key = `${index.of[id]!.face}/${index.of[id]!.i}/${index.of[id]!.j}`;
        const seen = byName.get(key);
        if (seen === undefined) byName.set(key, heights[id]!);
        else expect(heights[id]!).toBe(seen); // exactly, not approximately
      }
    }
    // The coarsest level's hexes are all present in the finest, so the finest
    // level's hex count is the number of distinct names seen.
    expect(byName.size).toBe(10 * REFERENCE_SIZE * REFERENCE_SIZE + 2);
  });

  it("keeps the coastline in one place across levels", () => {
    const uwp = "B564A98-9";
    const detail = planetDetail(SEED, uwp);
    const options = fieldOptionsFor(detail, uwp);
    const wanted = detail.hydrographicsPct! / 100;
    const sea = seaLevelFor(referenceHeights(SEED, options), wanted);
    for (const level of DETAIL_LEVELS) {
      const grid = buildGrid(level);
      const heights = generateHeights(grid, SEED, options);
      const index = buildRefIndex(grid);
      const fine = buildGrid(REFERENCE_SIZE);
      const fineHeights = generateHeights(fine, SEED, options);
      const fineIndex = buildRefIndex(fine);
      for (let id = 0; id < grid.cells.length; id++) {
        const twin = fineIndex.at(index.of[id]!)!;
        // Same hex, same side of the waterline at both levels.
        expect(heights[id]! <= sea).toBe(fineHeights[twin]! <= sea);
      }
    }
  });

  it("puts about the wanted fraction of the reference lattice under water", () => {
    const heights = referenceHeights(SEED);
    for (const wanted of [0.1, 0.4, 0.7]) {
      const sea = seaLevelFor(heights, wanted);
      const wet = heights.filter((h) => h <= sea).length / heights.length;
      expect(wet).toBeCloseTo(wanted, 2);
    }
  });

  it("counts each point of the reference lattice once", () => {
    expect(referenceHeights(SEED).length).toBe(10 * REFERENCE_SIZE * REFERENCE_SIZE + 2);
  });
});
