import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { generateHeights, seaLevelFor, referenceHeights } from "./height";
import { landmasses, starportSite } from "./site";

/**
 * Where a new world's starport is put. Spec 6.5.8.1: coastal land, on a landmass
 * large enough to hold a town, as near the equator as that allows.
 */

const SEEDS = ["Regina", "Vland", "Terra", "Damadas", "Aramis", "Efate"];

/** A world at a sea level that leaves it something of both. */
function world(seed: string, size = 12) {
  const grid = buildGrid(size);
  const heights = generateHeights(grid, seed);
  const seaLevel = seaLevelFor(referenceHeights(seed), 0.5);
  return { grid, heights, seaLevel };
}

describe("landmasses", () => {
  it("counts every land cell once, in one body or another", () => {
    const { grid, heights, seaLevel } = world("Regina");
    const isLand = (id: number) => heights[id]! > seaLevel;
    const { of, size } = landmasses(grid, isLand);
    const land = grid.cells.filter((cell) => isLand(cell.id)).length;
    expect(size.reduce((a, b) => a + b, 0)).toBe(land);
    for (const cell of grid.cells) expect(of[cell.id] !== -1).toBe(isLand(cell.id));
  });

  it("puts neighbouring land in one body and separated land in two", () => {
    const grid = buildGrid(6);
    // Nothing but one cell and its neighbours is land, so that is one body.
    const island = new Set([0, ...grid.cells[0]!.neighbours]);
    const one = landmasses(grid, (id) => island.has(id));
    expect(one.size).toEqual([island.size]);

    // A second island somewhere that touches nothing in the first.
    const far = grid.cells.find(
      (cell) => !island.has(cell.id) && cell.neighbours.every((n) => !island.has(n)),
    )!;
    const two = landmasses(grid, (id) => island.has(id) || id === far.id);
    expect(two.size.length).toBe(2);
    expect(two.size).toContain(1);
  });
});

describe("the starport site", () => {
  it("lands on the coast, on a major landmass, near the equator", () => {
    for (const seed of SEEDS) {
      const { grid, heights, seaLevel } = world(seed);
      const site = starportSite(grid, heights, seaLevel)!;
      expect(site).not.toBeNull();
      expect(site.coastal).toBe(true);

      const isLand = (id: number) => heights[id]! > seaLevel;
      const cell = grid.cells[site.cell]!;
      expect(isLand(cell.id)).toBe(true);
      expect(cell.neighbours.some((n) => !isLand(n))).toBe(true);

      // On a body worth calling a landmass rather than on a rock in the sea.
      const { of, size } = landmasses(grid, isLand);
      const largest = Math.max(...size);
      expect(size[of[cell.id]!]!).toBeGreaterThan(largest * 0.2);

      // Within the tropics. The sine of the latitude is the y of the centre, and
      // 0.5 is 30 degrees.
      expect(Math.abs(cell.centre[1])).toBeLessThan(0.5);
    }
  });

  it("gives the same site for the same world every time", () => {
    const { grid, heights, seaLevel } = world("Regina");
    const first = starportSite(grid, heights, seaLevel);
    expect(starportSite(grid, heights, seaLevel)).toEqual(first);
  });

  // A world can be all sea, and 6.5.8.2 still puts a starport on it rather than
  // leaving a world the profile says has one with nothing to show for it.
  it("still finds somewhere on a world with no land at all", () => {
    const grid = buildGrid(6);
    const site = starportSite(grid, new Float64Array(grid.cells.length), 0.5)!;
    expect(site).not.toBeNull();
    expect(site.coastal).toBe(false);
    // Nothing to choose between on height, so it goes to the equator.
    const chosen = Math.abs(grid.cells[site.cell]!.centre[1]);
    for (const cell of grid.cells) {
      expect(Math.abs(cell.centre[1])).toBeGreaterThanOrEqual(chosen - 1e-12);
    }
  });

  it("takes plain land where there is no coast to be had", () => {
    const grid = buildGrid(6);
    // Land everywhere: no cell has sea against it, so none is coastal.
    const heights = new Float64Array(grid.cells.length).fill(1);
    const site = starportSite(grid, heights, 0.5)!;
    expect(site.coastal).toBe(false);
    expect(heights[site.cell]!).toBeGreaterThan(0.5);
  });
});
