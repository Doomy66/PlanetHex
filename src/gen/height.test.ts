import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { REFERENCE_SIZE } from "../grid/coord";
import { buildHeightField, DEFAULT_FIELD_OPTIONS } from "./field";
import { generateHeights, heightsOn, referenceHeights, referenceHeightsOn } from "./height";

/**
 * Sampling a field that has already been built. The panels want two grids of one
 * world - the display grid and the finest grid the globe of 4.4.9 draws - and
 * building the field is most of the work, so it is built once and read twice. What
 * has to hold is that reading it twice gives what building it twice gave.
 */

const SEED = "HEIGHTSHARE";

describe("heights off a field already built", () => {
  it("are the heights that building one for them gives", () => {
    const field = buildHeightField(SEED, REFERENCE_SIZE, DEFAULT_FIELD_OPTIONS);
    for (const size of [6, 24]) {
      const grid = buildGrid(size);
      expect([...heightsOn(field, grid)]).toEqual([...generateHeights(grid, SEED)]);
    }
  });

  it("serve two grids of one world off the one field", () => {
    // What the application does: the display grid and the globe's finer grid, both
    // read off the field the surface was sampled from. Neither is disturbed by the
    // other having been read, and both agree with their own build.
    const field = buildHeightField(SEED, REFERENCE_SIZE, DEFAULT_FIELD_OPTIONS);
    const coarse = buildGrid(6);
    const fine = buildGrid(12);
    const first = heightsOn(field, coarse);
    const second = heightsOn(field, fine);
    expect([...heightsOn(field, coarse)]).toEqual([...first]);
    expect([...second]).toEqual([...generateHeights(fine, SEED)]);
  });

  it("gives every cell a height rather than leaving a gap", () => {
    const field = buildHeightField(SEED, REFERENCE_SIZE, DEFAULT_FIELD_OPTIONS);
    const heights = heightsOn(field, buildGrid(12));
    expect(heights.length).toBe(1442);
    for (const h of heights) {
      expect(Number.isNaN(h)).toBe(false);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  it("holds the same for the reference lattice sea level is read off", () => {
    const field = buildHeightField(SEED, REFERENCE_SIZE, DEFAULT_FIELD_OPTIONS);
    expect([...referenceHeightsOn(field)]).toEqual([...referenceHeights(SEED)]);
  });
});
