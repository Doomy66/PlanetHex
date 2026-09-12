import { describe, expect, it } from "vitest";
import {
  buildCraterField,
  craterList,
  craterOptionsFor,
  DEFAULT_CRATER_OPTIONS,
  MAX_CRATERS,
  NO_CRATERS,
  saturationOf,
  type Crater,
} from "./crater";
import { planetDetail } from "./detail";
import { latticePosition } from "../grid/coord";
import type { Vec3 } from "../grid/vec3";

const SEED = "Craters";
const optionsWith = (count: number) => ({ ...DEFAULT_CRATER_OPTIONS, count });

/**
 * The crater layer worked out the slow way: every crater tested against the point,
 * with no index in the way. What buildCraterField returns has to match this
 * exactly, since the buckets are only there to avoid the work and not to change
 * the answer.
 */
function bruteForce(craters: readonly Crater[], p: Vec3): number {
  let total = 0;
  for (const c of craters) {
    const dx = p[0] - c.centre[0];
    const dy = p[1] - c.centre[1];
    const dz = p[2] - c.centre[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= c.outerChord2) continue;
    const chord = Math.sqrt(d2);
    if (chord <= c.rimChord) {
      const d = chord / c.rimChord;
      total += c.depth * (d * d - 1) + c.rim * d * d * d * d;
    } else {
      const t = (Math.sqrt(c.outerChord2) - chord) / c.ejectaChord;
      total += c.rim * t * t;
    }
  }
  return total;
}

describe("craters", () => {
  it("gives a world with no impacts no layer at all", () => {
    expect(buildCraterField(SEED, optionsWith(0))).toBe(NO_CRATERS);
    expect(NO_CRATERS.offsetAt(3, 24, 10, 4)).toBe(0);
  });

  it("places the same impacts for the same seed and different ones for another", () => {
    const a = craterList(SEED, optionsWith(20));
    const b = craterList(SEED, optionsWith(20));
    const c = craterList("Elsewhere", optionsWith(20));
    expect(a.map((x) => x.centre)).toEqual(b.map((x) => x.centre));
    expect(a.map((x) => x.centre)).not.toEqual(c.map((x) => x.centre));
  });

  it("keeps every radius inside the two cuts", () => {
    for (const crater of craterList(SEED, optionsWith(400))) {
      expect(crater.radius).toBeGreaterThanOrEqual(DEFAULT_CRATER_OPTIONS.minRadius - 1e-12);
      expect(crater.radius).toBeLessThanOrEqual(DEFAULT_CRATER_OPTIONS.maxRadius + 1e-9);
    }
  });

  it("never cuts deeper than the ceiling, however wide the crater", () => {
    for (const crater of craterList(SEED, optionsWith(400))) {
      expect(crater.depth).toBeLessThanOrEqual(DEFAULT_CRATER_OPTIONS.maxDepth + 1e-12);
      expect(crater.depth).toBeGreaterThan(0);
    }
  });

  /**
   * The one that matters. A sample only ever looks in its own bucket, so a crater
   * left out of a bucket it overlaps would take a bite out of its own rim, and the
   * bite would be invisible in anything but a comparison against the slow answer.
   */
  it("files every crater under every bucket it reaches", () => {
    const options = optionsWith(300);
    const field = buildCraterField(SEED, options);
    const all = craterList(SEED, options);
    const size = 48;
    for (let f = 0; f < 20; f++) {
      for (let i = 0; i <= size; i += 3) {
        for (let j = 0; j <= i; j += 3) {
          const indexed = field.offsetAt(f, size, i, j);
          const slow = bruteForce(all, latticePosition(f, size, i, j));
          expect(indexed).toBeCloseTo(slow, 12);
        }
      }
    }
  });

  it("reads the same height on either side of a seam", () => {
    const field = buildCraterField(SEED, optionsWith(300));
    // Face 0's edge from corner 1 to corner 2 is face 5's edge as well, walked the
    // other way round, so the two faces have to agree along it.
    const size = 24;
    for (let k = 0; k <= size; k++) {
      const p = latticePosition(0, size, size, k);
      expect(field.offsetAt(0, size, size, k)).toBeCloseTo(bruteForce(field.craters, p), 12);
    }
  });

  it("is the same crater at every detail level", () => {
    const field = buildCraterField(SEED, optionsWith(200));
    // A cell of the size 24 lattice is a cell of the size 96 one, four steps out.
    for (let i = 0; i <= 24; i += 2) {
      for (let j = 0; j <= i; j += 2) {
        expect(field.offsetAt(7, 24, i, j)).toBeCloseTo(field.offsetAt(7, 96, i * 4, j * 4), 12);
      }
    }
  });

  it("digs a bowl, raises a rim, and comes back to nothing", () => {
    const field = buildCraterField(SEED, optionsWith(1));
    const crater = field.craters[0]!;
    const c = crater.centre;
    // A direction at right angles to the centre walks a great circle through it.
    const up: Vec3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const raw: Vec3 = [
      up[1] * c[2] - up[2] * c[1],
      up[2] * c[0] - up[0] * c[2],
      up[0] * c[1] - up[1] * c[0],
    ];
    const len = Math.hypot(raw[0], raw[1], raw[2]);
    const along = (multiple: number): number => {
      const a = crater.radius * multiple;
      const p: Vec3 = [
        c[0] * Math.cos(a) + (raw[0] / len) * Math.sin(a),
        c[1] * Math.cos(a) + (raw[1] / len) * Math.sin(a),
        c[2] * Math.cos(a) + (raw[2] / len) * Math.sin(a),
      ];
      return bruteForce(field.craters, p);
    };
    expect(along(0)).toBeCloseTo(-crater.depth, 12);
    expect(along(0.5)).toBeGreaterThan(along(0));
    expect(along(0.5)).toBeLessThan(0);
    expect(along(1)).toBeGreaterThan(0);
    expect(along(1.5)).toBeGreaterThan(0);
    expect(along(1.5)).toBeLessThan(along(1));
    expect(along(DEFAULT_CRATER_OPTIONS.ejectaReach)).toBeCloseTo(0, 12);
    expect(along(3)).toBe(0);
  });

  describe("how many a world keeps", () => {
    const countFor = (uwp: string, seed = SEED, override: number | null = null) =>
      craterOptionsFor(seed, planetDetail(seed, uwp), uwp, override).count;

    it("leaves an airless dry rock a full record", () => {
      expect(countFor("X400000-0")).toBeGreaterThan(400);
    });

    it("wipes a thick wet world clean", () => {
      expect(countFor("A867A69-9")).toBe(0);
    });

    it("keeps fewer the more weather a world has", () => {
      expect(countFor("X400000-0")).toBeGreaterThan(countFor("E564000-0"));
      expect(countFor("E564000-0")).toBeGreaterThan(countFor("A867A69-9"));
    });

    /**
     * Two airless rocks have not been hit the same number of times. The profile
     * says nothing about which, so the seed does.
     */
    it("draws a different record for every seed", () => {
      const counts = new Set(
        ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((s) => countFor("X400000-0", s)),
      );
      expect(counts.size).toBeGreaterThan(1);
    });

    it("draws the same record twice for one seed", () => {
      expect(countFor("X400000-0", "Steady")).toBe(countFor("X400000-0", "Steady"));
    });

    it("takes the count the user gave over the one it rolled", () => {
      expect(countFor("X400000-0", SEED, 42)).toBe(42);
      // Zero is a decision, and null is the absence of one.
      expect(countFor("X400000-0", SEED, 0)).toBe(0);
      expect(countFor("X400000-0", SEED, null)).toBeGreaterThan(0);
    });

    it("holds an asked-for count inside the ceiling", () => {
      expect(countFor("X400000-0", SEED, MAX_CRATERS * 10)).toBe(MAX_CRATERS);
      expect(countFor("X400000-0", SEED, -5)).toBe(0);
    });

    it("gives a profile it cannot read no craters, but still takes an override", () => {
      const detail = planetDetail(SEED, "nonsense");
      expect(craterOptionsFor(SEED, detail, "nonsense")).toEqual(DEFAULT_CRATER_OPTIONS);
      expect(craterOptionsFor(SEED, detail, "nonsense", 30).count).toBe(30);
    });
  });

  describe("how much ground the impacts take", () => {
    it("counts nothing on a world nothing hit", () => {
      expect(saturationOf([])).toBe(0);
    });

    it("rises with the count and passes one when the surface saturates", () => {
      const cover = (count: number) => saturationOf(craterList(SEED, optionsWith(count)));
      expect(cover(200)).toBeLessThan(cover(1000));
      expect(cover(1000)).toBeLessThan(1);
      expect(cover(5000)).toBeGreaterThan(1);
    });
  });
});
