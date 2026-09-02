import { describe, expect, it } from "vitest";
import { buildGrid, cellCount } from "./grid";
import { generateHeights, seaCoverage } from "../gen/height";

const SIZES = [1, 2, 5, 7];

describe("grid geometry", () => {
  it.each(SIZES)("has 10n^2 + 2 cells at size %i", (size) => {
    expect(buildGrid(size).cells.length).toBe(cellCount(size));
  });

  it.each(SIZES)("has exactly twelve pentagons at size %i", (size) => {
    const grid = buildGrid(size);
    const pentagons = grid.cells.filter((c) => c.isPentagon);
    expect(pentagons.length).toBe(12);
    for (const cell of grid.cells) {
      expect(cell.neighbours.length).toBe(cell.isPentagon ? 5 : 6);
    }
  });

  it.each(SIZES)("keeps neighbour links symmetric at size %i", (size) => {
    const grid = buildGrid(size);
    for (const cell of grid.cells) {
      for (const n of cell.neighbours) {
        expect(grid.cells[n]!.neighbours).toContain(cell.id);
        expect(n).not.toBe(cell.id);
      }
    }
  });

  // The failure this guards against is a neighbour walk that stops at face edges,
  // which yields twenty separate patches that still look plausible when drawn.
  it.each(SIZES)("is a single connected surface at size %i", (size) => {
    const grid = buildGrid(size);
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      for (const n of grid.cells[queue.pop()!]!.neighbours) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(grid.cells.length);
  });

  it.each(SIZES)("puts every cell centre on the unit sphere at size %i", (size) => {
    for (const cell of buildGrid(size).cells) {
      expect(Math.hypot(...cell.centre)).toBeCloseTo(1, 10);
    }
  });

  it.each(SIZES)("gives each cell an outline matching its neighbour count at size %i", (size) => {
    for (const cell of buildGrid(size).cells) {
      expect(cell.corners.length).toBe(cell.neighbours.length);
    }
  });

  it("rejects a size below one", () => {
    expect(() => buildGrid(0)).toThrow();
    expect(() => buildGrid(2.5)).toThrow();
  });
});

describe("net layout", () => {
  it.each(SIZES)("places every cell somewhere on the net at size %i", (size) => {
    const grid = buildGrid(size);
    const placed = new Set<number>();
    for (const face of grid.net) {
      for (const p of face.placements) placed.add(p.cell);
    }
    expect(placed.size).toBe(grid.cells.length);
  });

  it("draws seam cells on more than one face", () => {
    const grid = buildGrid(5);
    const faceCounts = new Map<number, number>();
    for (const face of grid.net) {
      for (const p of face.placements) {
        faceCounts.set(p.cell, (faceCounts.get(p.cell) ?? 0) + 1);
      }
    }
    const shared = [...faceCounts.values()].filter((n) => n > 1);
    expect(shared.length).toBeGreaterThan(0);
    // A pentagon cell sits on a corner where five faces meet.
    for (const cell of grid.cells) {
      if (cell.isPentagon) expect(faceCounts.get(cell.id)).toBe(5);
    }
  });

  it("keeps every placement inside the net bounds", () => {
    const grid = buildGrid(5);
    for (const face of grid.net) {
      expect(face.hexOffsets.length).toBe(6);
      for (const p of face.placements) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(grid.netWidth + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(grid.netHeight + 1e-9);
      }
    }
  });
});

describe("height generation", () => {
  it("is the same planet from the same seed", () => {
    const grid = buildGrid(5);
    expect([...generateHeights(grid, "Damadas")]).toEqual([...generateHeights(grid, "Damadas")]);
  });

  it("is a different planet from a different seed", () => {
    const grid = buildGrid(5);
    expect([...generateHeights(grid, "Damadas")]).not.toEqual([...generateHeights(grid, "Regina")]);
  });

  it.each(SIZES)("settles every cell within range at size %i", (size) => {
    const grid = buildGrid(size);
    const heights = generateHeights(grid, "seed-" + size);
    expect(heights.length).toBe(grid.cells.length);
    for (const h of heights) {
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });

  // Any cell the fill fails to reach keeps its NaN marker rather than passing as
  // a sea-level zero, so this catches a fill that stops at a face boundary.
  it("reaches every cell", () => {
    const grid = buildGrid(7);
    const heights = generateHeights(grid, "coverage");
    expect([...heights].filter((h) => Number.isNaN(h))).toEqual([]);
  });

  it("produces both land and sea", () => {
    const grid = buildGrid(7);
    for (const seed of ["Damadas", "Regina", "Vland", "Terra"]) {
      const wet = seaCoverage(generateHeights(grid, seed), 0.5);
      expect(wet).toBeGreaterThan(0.05);
      expect(wet).toBeLessThan(0.95);
    }
  });
});
