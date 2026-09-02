import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { locate } from "../grid/icosahedron";
import { openHeightField, DEFAULT_FIELD_OPTIONS, fieldSizeFor } from "../gen/field";
import { RINGS, sampleAt, ZOOM } from "./local";

/**
 * The local view's patch, without the drawing. Mirrors what createLocalView walks
 * so the seam handling can be held to account away from a browser.
 */
function patch(cell: number, gridSize: number) {
  const grid = buildGrid(gridSize);
  const field = openHeightField("PATCH", DEFAULT_FIELD_OPTIONS);
  const fine = fieldSizeFor(gridSize) * ZOOM;
  const home = locate(grid.cells[cell]!.centre, fine);
  const ci = Math.round(home.i);
  const cj = Math.round(home.j);
  const reach = Math.round(ZOOM * RINGS);
  const found = new Map<string, number>();
  let missing = 0;
  for (let dp = -reach; dp <= reach; dp++) {
    for (let dq = Math.max(-reach, -reach - dp); dq <= Math.min(reach, reach - dp); dq++) {
      const h = sampleAt(field, home.face, fine, ci + dp + dq, cj + dq);
      if (h === null) missing++;
      else found.set(`${dp},${dq}`, h.height);
    }
  }
  return { found, missing, reach };
}

describe("the local patch", () => {
  const grid = buildGrid(24);

  it("fills every point of the window for an interior cell", () => {
    const inner = grid.cells.findIndex((c) => !c.isPentagon);
    expect(patch(inner, 24).missing).toBe(0);
  });

  it("fills every point for a cell on a face seam", () => {
    // Cells drawn by more than one face are the ones sitting on a seam.
    const drawnBy = new Map<number, Set<number>>();
    for (const face of grid.net) {
      for (const p of face.placements) {
        const set = drawnBy.get(p.cell) ?? new Set();
        set.add(face.face);
        drawnBy.set(p.cell, set);
      }
    }
    const seams = [...drawnBy.entries()].filter(([, f]) => f.size > 1).map(([c]) => c);
    expect(seams.length).toBeGreaterThan(100);
    for (const cell of seams.slice(0, 40)) expect(patch(cell, 24).missing).toBe(0);
  });

  it("fills every point at the twelve corners, where five faces meet", () => {
    const corners = grid.cells.filter((c) => c.isPentagon).map((c) => c.id);
    expect(corners).toHaveLength(12);
    for (const cell of corners) expect(patch(cell, 24).missing).toBe(0);
  });

  it("runs continuously across a seam rather than jumping at it", () => {
    // A wrong face mapping shows up as neighbouring samples that disagree wildly.
    // Compared against the same measure taken well inside a face.
    const jumpiness = (cell: number) => {
      const { found, reach } = patch(cell, 24);
      let worst = 0;
      for (const [key, h] of found) {
        const [dp, dq] = key.split(",").map(Number) as [number, number];
        for (const [ep, eq] of [[1, 0], [0, 1], [-1, 1]] as const) {
          const other = found.get(`${dp + ep},${dq + eq}`);
          if (other !== undefined) worst = Math.max(worst, Math.abs(other - h));
        }
      }
      expect(reach).toBeGreaterThan(0);
      return worst;
    };
    const inner = grid.cells.findIndex((c) => !c.isPentagon);
    const corner = grid.cells.find((c) => c.isPentagon)!.id;
    // The corner patch is allowed to be rougher, but not by an order of magnitude.
    expect(jumpiness(corner)).toBeLessThan(jumpiness(inner) * 3 + 0.05);
  });

  it("samples finer than the display grid rather than magnifying it", () => {
    const fine = fieldSizeFor(24) * ZOOM;
    expect(fine).toBeGreaterThan(fieldSizeFor(24));
    // Distinct heights within one display hex: proof there is sub-hex detail.
    const inner = grid.cells.findIndex((c) => !c.isPentagon);
    const { found } = patch(inner, 24);
    const withinOneHex = [...found.entries()]
      .filter(([k]) => {
        const [dp, dq] = k.split(",").map(Number) as [number, number];
        return Math.abs(dp) + Math.abs(dq) + Math.abs(dp + dq) <= ZOOM;
      })
      .map(([, h]) => h);
    expect(new Set(withinOneHex).size).toBeGreaterThan(10);
  });
});
