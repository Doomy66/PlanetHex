import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { strokeWidths } from "./map";

/**
 * Geometry checks for the flat net. Nothing here draws anything, but a hex
 * tiling that leaves gaps or overlaps fails these before it reaches the screen.
 */

const key = (x: number, y: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;

describe("net tiling", () => {
  const grid = buildGrid(5);

  it("gives every hexagon the same size and shape within a face", () => {
    for (const face of grid.net) {
      const radii = face.hexOffsets.map(([x, y]) => Math.hypot(x, y));
      for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 12);
    }
  });

  it("sizes hexagons so opposite flats are one lattice step apart", () => {
    const spacing = 1 / grid.size;
    for (const face of grid.net) {
      const r = Math.hypot(face.hexOffsets[0]![0], face.hexOffsets[0]![1]);
      // Regular hexagon: distance across the flats is circumradius * sqrt(3).
      expect(r * Math.sqrt(3)).toBeCloseTo(spacing, 12);
    }
  });

  // Two hexagons one lattice step apart must share an edge exactly: two corners,
  // not one (a gap) and not three (an overlap).
  it("makes neighbouring hexagons share exactly one edge", () => {
    const spacing = 1 / grid.size;
    let checked = 0;
    for (const face of grid.net) {
      const corners = face.placements.map((p) =>
        face.hexOffsets.map(([dx, dy]) => key(p.x + dx, p.y + dy)),
      );
      for (let a = 0; a < face.placements.length; a++) {
        for (let b = a + 1; b < face.placements.length; b++) {
          const pa = face.placements[a]!;
          const pb = face.placements[b]!;
          if (Math.abs(Math.hypot(pb.x - pa.x, pb.y - pa.y) - spacing) > 1e-9) continue;
          const shared = corners[a]!.filter((c) => corners[b]!.includes(c));
          expect(shared.length).toBe(2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("lands the whole net inside its declared bounds", () => {
    let maxX = 0;
    let maxY = 0;
    for (const face of grid.net) {
      for (const p of face.placements) {
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    expect(maxX).toBeCloseTo(grid.netWidth, 9);
    expect(maxY).toBeCloseTo(grid.netHeight, 9);
  });
});

describe("stroke widths", () => {
  it("keeps a seam at the same fraction of a hex, level to level", () => {
    const perUnit = 4000;
    for (const size of [6, 12, 24, 48, 96]) {
      const { seam } = strokeWidths(size, perUnit);
      expect(seam * size).toBeCloseTo(strokeWidths(6, perUnit).seam * 6, 12);
    }
  });

  it("drops the seam when asked to draw the ground smooth", () => {
    const perUnit = 549 / 5.74;
    for (const size of [6, 24, 96]) {
      expect(strokeWidths(size, perUnit, false).seam).toBeGreaterThan(0);
      expect(strokeWidths(size, perUnit, true).seam).toBe(0);
    }
  });

  it("keeps a mark visible whether the seams are drawn or not", () => {
    const perUnit = 549 / 5.74;
    for (const smooth of [false, true]) {
      for (const size of [6, 24, 96]) {
        const { mark } = strokeWidths(size, perUnit, smooth);
        expect(mark * perUnit).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("holds a mark at the seam's own fraction where a hex is large", () => {
    // Zoomed in, the floor stops mattering and a mark sits in the seam as 4.3.4.1
    // has it rather than standing out of it.
    const { seam, mark } = strokeWidths(24, 40000);
    expect(mark).toBeCloseTo(seam, 12);
  });

  it("has a width for a map nothing has measured, as a picture is drawn", () => {
    for (const perUnit of [0, Number.NaN]) {
      expect(strokeWidths(96, perUnit).seam).toBeGreaterThan(0);
      expect(strokeWidths(96, perUnit).mark).toBeGreaterThan(0);
    }
  });
});
