import { describe, expect, it } from "vitest";
import { niceStep, planContours, traceContours, type Step } from "./contour";

/** Height at a lattice offset, over a window of the given reach. */
const window_ = (reach: number, h: (dp: number, dq: number) => number) => (dp: number, dq: number) =>
  Math.abs(dp) <= reach && Math.abs(dq) <= reach && Math.abs(dp + dq) <= reach ? h(dp, dq) : null;

describe("the contour interval", () => {
  it("is one, two or five times a power of ten", () => {
    for (const h of [0.003, 0.011, 0.04, 0.09, 0.3, 7]) {
      const step = niceStep(h);
      const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
      expect([1, 2, 5]).toContain(Number(mantissa.toFixed(6)));
    }
  });

  it("is at or above what it was asked for, so the count is a ceiling", () => {
    for (const h of [0.0007, 0.013, 0.026, 0.4, 1.7]) expect(niceStep(h)).toBeGreaterThanOrEqual(h);
  });

  it("keeps a line on the datum, wherever the span sits around it", () => {
    for (const [low, high] of [[0.2, 0.9], [0.44, 0.62], [0.1, 0.55]] as const) {
      const { levels } = planContours(low, high, 0.5);
      expect(levels.some((l) => Math.abs(l - 0.5) < 1e-9)).toBe(true);
    }
  });

  it("draws no more lines than it set out to", () => {
    for (const [low, high] of [[0, 1], [0.3, 0.31], [0.49, 0.94]] as const) {
      expect(planContours(low, high, 0.5, 9).levels.length).toBeLessThanOrEqual(10);
    }
  });

  it("holds the interval still while the patch moves, so lines do not slide", () => {
    // Two patches of the same span at different heights. Same datum, same lines
    // where they overlap, which is what stops the lines swimming as the pointer
    // wanders across the map.
    const a = planContours(0.5, 0.7, 0.5);
    const b = planContours(0.55, 0.75, 0.5);
    expect(b.step).toBe(a.step);
    for (const level of b.levels) {
      if (level <= 0.7) expect(a.levels.some((l) => Math.abs(l - level) < 1e-9)).toBe(true);
    }
  });

  it("draws nothing over ground with no relief at all", () => {
    expect(planContours(0.4, 0.4, 0.5)).toEqual({ step: 0, levels: [] });
  });
});

describe("tracing a level", () => {
  /**
   * Length in the drawing, from a length in lattice steps. The two steps are unit
   * vectors 60 degrees apart, which is what the neighbours of the lattice make
   * them, so this is the law of cosines on that angle.
   */
  const spanOf = ({ from, to }: { from: Step; to: Step }) => {
    const a = to[0] - from[0];
    const b = to[1] - from[1];
    return Math.sqrt(a * a + a * b + b * b);
  };

  /** One side of a hexagon whose centres are one step apart. */
  const SIDE = 1 / Math.sqrt(3);

  it("draws each piece along one whole side of a hex", () => {
    const traced = traceContours(window_(10, (dp, dq) => 0.5 + 0.004 * dp + 0.003 * dq), 10, [
      0.49, 0.5, 0.52,
    ]);
    for (const line of traced) {
      expect(line.segments.length).toBeGreaterThan(0);
      for (const segment of line.segments) expect(spanOf(segment)).toBeCloseTo(SIDE, 9);
    }
  });

  it("puts the line between the two hexes it separates, not through either", () => {
    // A ramp rising with dp: the 0.55 line parts the hexes at 5, which are at the
    // level, from the hexes at 4 below it. Every piece of it has its middle
    // halfway between two of those centres, though not on the same axis each
    // time: a hex at 5 has two sides on that boundary, so the line steps from one
    // to the other as a hex map's line has to.
    const traced = traceContours(window_(10, (dp) => 0.5 + 0.01 * dp), 10, [0.55]);
    const segments = traced[0]!.segments;
    expect(segments.length).toBeGreaterThan(10);
    for (const { from, to } of segments) expect((from[0] + to[0]) / 2).toBeCloseTo(4.5, 9);
    const stepped = new Set(segments.map(({ from, to }) => ((from[1] + to[1]) / 2) % 1 !== 0));
    expect(stepped).toEqual(new Set([true, false]));
  });

  it("is every side parting a hex at the level from one below it, and only those", () => {
    // The same question asked of the hexes rather than of the lines: walk every
    // hex and all six of its neighbours, and collect the sides that ought to
    // carry the level. The tracer has to come back with that set exactly.
    const h = (dp: number, dq: number) => 0.5 + 0.006 * dp - 0.004 * dq;
    const at = window_(9, h);
    const level = 0.5;
    const ALL: Step[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
    const wanted = new Set<string>();
    for (let dp = -9; dp <= 9; dp++) {
      for (let dq = -9; dq <= 9; dq++) {
        const here = at(dp, dq);
        if (here === null) continue;
        for (const [sp, sq] of ALL) {
          const there = at(dp + sp, dq + sq);
          if (there === null) continue;
          if ((here >= level) === (there >= level)) continue;
          wanted.add(`${(dp + sp / 2).toFixed(6)},${(dq + sq / 2).toFixed(6)}`);
        }
      }
    }
    const drawn = traceContours(at, 9, [level])[0]!.segments.map(
      ({ from, to }) =>
        `${((from[0] + to[0]) / 2).toFixed(6)},${((from[1] + to[1]) / 2).toFixed(6)}`,
    );
    expect(wanted.size).toBeGreaterThan(20);
    expect(new Set(drawn)).toEqual(wanted);
    // One piece per side, not one per hex looking at it.
    expect(drawn.length).toBe(wanted.size);
  });

  it("closes a ring around a summit, with every end met by another piece", () => {
    // A cone: each level is one closed loop, so no piece of it has a loose end
    // except where the loop runs out of the window, which this one does not.
    const cone = (dp: number, dq: number) =>
      0.9 - 0.02 * Math.sqrt(dp * dp + dp * dq + dq * dq);
    const traced = traceContours(window_(14, cone), 14, [0.8]);
    const ends = new Map<string, number>();
    for (const { from, to } of traced[0]!.segments) {
      for (const end of [from, to]) {
        const key = `${end[0].toFixed(6)},${end[1].toFixed(6)}`;
        ends.set(key, (ends.get(key) ?? 0) + 1);
      }
    }
    expect(ends.size).toBeGreaterThan(20);
    for (const count of ends.values()) expect(count).toBe(2);
  });

  it("draws each side once rather than once from either hex", () => {
    const traced = traceContours(window_(8, (dp) => 0.5 + 0.01 * dp), 8, [0.55]);
    const sides = new Set(
      traced[0]!.segments.map(
        ({ from, to }) => `${((from[0] + to[0]) / 2).toFixed(6)},${((from[1] + to[1]) / 2).toFixed(6)}`,
      ),
    );
    expect(sides.size).toBe(traced[0]!.segments.length);
  });

  it("draws nothing where the level is off the ground entirely", () => {
    const traced = traceContours(window_(6, () => 0.3), 6, [0.6, 0.9]);
    for (const line of traced) expect(line.segments).toEqual([]);
  });

  it("leaves alone any hex the patch could not place", () => {
    // Nothing placed at all, which is what a window off the world would give.
    const traced = traceContours(() => null, 8, [0.5]);
    expect(traced[0]!.segments).toEqual([]);
  });

  it("draws nothing between two hexes of the same height, level or not", () => {
    // Ground flat at exactly the level asked for. There is no line to draw: the
    // level passes through both hexes and separates neither from the other.
    const traced = traceContours(window_(6, () => 0.6), 6, [0.6]);
    expect(traced[0]!.segments).toEqual([]);
  });

  it("draws a level lying exactly on the samples like any other", () => {
    // The 0.6 line of this slope is exactly the height of the hexes at dp of 2.
    // Those count as at the level rather than below it, so the line runs along
    // their near side, parting them from the hexes at 1.
    const traced = traceContours(window_(9, (dp) => 0.5 + 0.05 * dp), 9, [0.6]);
    expect(traced[0]!.segments.length).toBeGreaterThan(10);
    for (const { from, to } of traced[0]!.segments) {
      expect((from[0] + to[0]) / 2).toBeCloseTo(1.5, 9);
    }
  });
});
