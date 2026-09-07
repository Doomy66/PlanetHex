import { describe, expect, it } from "vitest";
import { ANGLE, BASE_DROP, EXAGGERATION, RELIEF, SQUASH, isoView } from "./iso";
import { footprint, inwardOf } from "./relief";

/**
 * The projection the relief view's overlays are drawn with. It has to be the same
 * view the camera of relief.ts takes, since the marks drawn through it stand on
 * ground drawn through that. Spec 4.5.9.
 */
describe("the view from thirty degrees", () => {
  it("is worth the sine going into the drawing and the cosine going up it", () => {
    expect(SQUASH).toBeCloseTo(Math.sin(ANGLE), 12);
    expect(SQUASH).toBeCloseTo(0.5, 12);
    expect(RELIEF).toBeCloseTo(EXAGGERATION * Math.cos(ANGLE), 12);
  });

  it("keeps distance true across the drawing, which is what the scale bar needs", () => {
    const view = isoView(0.4);
    const [ax] = view.place(3, 7, 0.5);
    const [bx] = view.place(8, 7, 0.5);
    expect(bx - ax).toBeCloseTo(5, 12);
    // And at any height: only the depth axis is squashed.
    const [cx] = view.place(3, -2, 0.9);
    const [dx] = view.place(8, -2, 0.42);
    expect(dx - cx).toBeCloseTo(5, 12);
  });

  it("stands nothing on the ground plane at the height it is cut off at", () => {
    const view = isoView(0.37);
    expect(view.rise(0.37)).toBe(0);
    expect(view.place(2, 4, 0.37)).toEqual([2, 4 * SQUASH]);
  });

  it("draws higher ground higher up, which in an SVG is a smaller y", () => {
    const view = isoView(0.2);
    const [, low] = view.place(0, 0, 0.3);
    const [, high] = view.place(0, 0, 0.6);
    expect(high).toBeLessThan(low);
    expect(low - high).toBeCloseTo(0.3 * RELIEF, 12);
  });

  it("lifts by a fixed amount a height, so two patches can be compared", () => {
    const view = isoView(0);
    expect(view.rise(0.2)).toBeCloseTo(view.rise(0.1) * 2, 12);
    // The same rise wherever the patch sits on the world's own range of height.
    const high = isoView(0.7);
    expect(high.rise(0.9) - high.rise(0.8)).toBeCloseTo(view.rise(0.1), 12);
  });

  it("puts the floor of the block under the lowest ground in view", () => {
    const view = isoView(0.5);
    // Below the ground plane on screen, by the drop seen from the angle.
    expect(view.floor(0)).toBeCloseTo(BASE_DROP * Math.cos(ANGLE), 12);
    expect(view.floor(4)).toBeGreaterThan(view.place(0, 4, 0.5)[1]);
  });
});

describe("the patch's footprint", () => {
  /** How far a lattice offset is from the middle, in hexes. */
  const away = (cell: readonly [number, number]) =>
    Math.max(Math.abs(cell[0]), Math.abs(cell[1]), Math.abs(cell[0] + cell[1]));

  it("is the ring of hexes at exactly the reach of the patch", () => {
    for (const reach of [1, 4, 20]) {
      const ring = footprint(reach);
      expect(ring).toHaveLength(6 * reach);
      for (const cell of ring) expect(away(cell)).toBe(reach);
    }
  });

  it("walks round in order, a step at a time, and closes", () => {
    const ring = footprint(9);
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % ring.length]!;
      // Neighbours on the lattice: one step apart, never a jump or a repeat.
      expect(away([b[0] - a[0], b[1] - a[1]])).toBe(1);
    }
  });

  it("names each hex of the ring once", () => {
    const ring = footprint(12);
    expect(new Set(ring.map((c) => `${c[0]},${c[1]}`)).size).toBe(ring.length);
  });

  it("has something to say about a patch of one hex", () => {
    expect(footprint(0)).toEqual([[0, 0]]);
  });
});

describe("the step inwards", () => {
  it("moves a hex of the rim one nearer the middle", () => {
    const away2 = (cell: readonly [number, number]) =>
      Math.max(Math.abs(cell[0]), Math.abs(cell[1]), Math.abs(cell[0] + cell[1]));
    for (const cell of footprint(6)) {
      expect(away2(inwardOf(cell))).toBe(away2(cell) - 1);
    }
  });

  it("leaves the middle where it is, having nowhere nearer to go", () => {
    expect(inwardOf([0, 0])).toEqual([0, 0]);
  });
});
