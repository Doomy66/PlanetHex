import { describe, expect, it } from "vitest";
import { globeRadius, globeTiltRadians } from "./globe";

/**
 * The sphere's radius against the diameter of 6.12. Spec 4.4.5. Nothing here
 * touches three.js: the mapping is arithmetic, and it is what decides whether a
 * small world reads as small.
 */

describe("globe radius", () => {
  it("draws the largest world at the full radius", () => {
    expect(globeRadius(16000)).toBeCloseTo(1, 12);
  });

  it("keeps a size 0 world at about a quarter of that", () => {
    // Size 0 covers up to 1000km, so the whole digit sits near the floor.
    expect(globeRadius(0)).toBeCloseTo(0.25, 12);
    expect(globeRadius(1000)).toBeGreaterThan(0.25);
    expect(globeRadius(1000)).toBeLessThan(0.32);
  });

  it("grows with the diameter across the digits", () => {
    const tops = [1000, 1600, 3200, 4800, 6400, 8000, 9600, 11200, 12800, 14400, 16000];
    for (let i = 1; i < tops.length; i++) {
      expect(globeRadius(tops[i]!)).toBeGreaterThan(globeRadius(tops[i - 1]!));
    }
  });

  it("gives an unreadable UWP the full radius rather than a guess", () => {
    expect(globeRadius(null)).toBe(1);
  });

  it("stays within the panel for a diameter beyond the table", () => {
    expect(globeRadius(1e6)).toBe(1);
    expect(globeRadius(-5)).toBe(0.25);
  });
});

/**
 * The lean of the axis against the tilt of 6.12.3. Spec 4.4.7. As with the radius,
 * the mapping is arithmetic and nothing here touches three.js.
 */

describe("globe tilt", () => {
  it("stands an untilted world upright", () => {
    expect(globeTiltRadians(0)).toBe(0);
  });

  it("lays a world at right angles on its side", () => {
    expect(globeTiltRadians(90)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("turns a retrograde world past upside down", () => {
    // 157 degrees of obliquity is 23 degrees of seasonal tilt with the world
    // turning backwards, so the pole goes below the plane rather than further over.
    expect(globeTiltRadians(157)).toBeCloseTo((157 * Math.PI) / 180, 12);
    expect(globeTiltRadians(180)).toBeCloseTo(Math.PI, 12);
  });

  it("leans an Earth-like world by its own tilt", () => {
    expect(globeTiltRadians(23.4)).toBeCloseTo((23.4 * Math.PI) / 180, 12);
  });

  it("grows with the tilt", () => {
    for (let deg = 1; deg <= 180; deg++) {
      expect(globeTiltRadians(deg)).toBeGreaterThan(globeTiltRadians(deg - 1));
    }
  });

  it("holds a tilt from outside the range to the ends of it", () => {
    expect(globeTiltRadians(-10)).toBe(0);
    expect(globeTiltRadians(200)).toBeCloseTo(Math.PI, 12);
  });
});
