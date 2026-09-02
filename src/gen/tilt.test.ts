import { describe, expect, it } from "vitest";
import { isRetrograde, obliquityFor, seasonalTiltDeg } from "./climate";

/**
 * The obliquity model of 6.12.3. These are distribution tests: no single world
 * can be wrong, so what is checked is the shape of ten thousand of them against
 * the one sample of eight anybody has actually measured.
 *
 * The settled share is set by how far in a world sits, so these run at the despin
 * figure a world at about half an AU has. Where that figure comes from and how it
 * lands across a run of rolled worlds is climate.test.ts's business.
 *
 * Solar system obliquities, in degrees: Mercury 0.03, Venus 177.4, Earth 23.4,
 * Mars 25.2, Jupiter 3.1, Saturn 26.7, Uranus 97.8, Neptune 28.3.
 */

/** Despin at 0.61 AU, which puts a fifth of worlds in the settled population. */
const SETTLED_FIFTH = 0.2;
const WORLDS = Array.from({ length: 10000 }, (_, i) => obliquityFor(`tilt-${i}`, SETTLED_FIFTH));
const share = (test: (deg: number) => boolean) =>
  WORLDS.filter(test).length / WORLDS.length;

describe("axial tilt", () => {
  it("gives the same world the same tilt", () => {
    expect(obliquityFor("Regina", 0.2)).toBe(obliquityFor("Regina", 0.2));
    expect(obliquityFor("Regina", 0.2)).not.toBe(obliquityFor("Vland", 0.2));
  });

  it("stays inside the obliquity range", () => {
    for (const deg of WORLDS) {
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThanOrEqual(180);
    }
  });

  it("settles every world nearly upright where tides have had their way", () => {
    for (let i = 0; i < 200; i++) expect(obliquityFor(`locked-${i}`, 1)).toBeLessThan(5);
  });

  it("settles none of them where tides have not reached", () => {
    const free = Array.from({ length: 2000 }, (_, i) => obliquityFor(`free-${i}`, 0));
    expect(free.filter((d) => d < 3).length / free.length).toBeLessThan(0.05);
  });

  it("settles about a fifth of worlds nearly upright, as tides do", () => {
    // Mercury and Venus are both under 3 degrees off upright.
    expect(share((d) => d < 3)).toBeGreaterThan(0.15);
    expect(share((d) => d < 3)).toBeLessThan(0.28);
  });

  it("puts most of the rest in the band the solar system's middle five sit in", () => {
    // Jupiter 3.1 through Neptune 28.3, with room either side.
    expect(share((d) => d >= 3 && d <= 45)).toBeGreaterThan(0.5);
  });

  it("throws a few worlds right over", () => {
    // Uranus at 97.8 and Venus at 177.4 are one in four of the solar system's
    // eight, which is small-number territory; a tenth either side of that is fine.
    expect(share((d) => d > 60)).toBeGreaterThan(0.05);
    expect(share((d) => d > 60)).toBeLessThan(0.2);
  });

  it("turns about one world in ten backwards", () => {
    // Half of the isotropic population, which is a fifth of all worlds.
    expect(share(isRetrograde)).toBeGreaterThan(0.05);
    expect(share(isRetrograde)).toBeLessThan(0.15);
  });

  it("centres the moderate worlds near Earth's own tilt", () => {
    const moderate = WORLDS.filter((d) => d >= 3 && d <= 45).sort((a, b) => a - b);
    const median = moderate[Math.floor(moderate.length / 2)]!;
    expect(median).toBeGreaterThan(15);
    expect(median).toBeLessThan(32);
  });

  it("is not the flat draw it replaced", () => {
    // A uniform 0 to 90 put a quarter of all worlds past 67.5 degrees, where the
    // poles take more sun than the equator and no cap survives. That band is now
    // about a third of what it was, and all of it comes from the isotropic fifth.
    expect(share((d) => seasonalTiltDeg(d) > 67.5)).toBeLessThan(0.1);
    expect(share((d) => seasonalTiltDeg(d) > 67.5)).toBeGreaterThan(0.04);
  });

  it("prefers no obliquity at all to a right angle", () => {
    // The isotropic draw on its own says the opposite. This is what the other two
    // populations are there to correct.
    expect(share((d) => d < 10)).toBeGreaterThan(share((d) => d > 80 && d < 100) * 3);
  });
});

describe("seasonal tilt", () => {
  it("is the obliquity itself for a world turning the right way", () => {
    expect(seasonalTiltDeg(0)).toBe(0);
    expect(seasonalTiltDeg(23.4)).toBeCloseTo(23.4, 12);
    expect(seasonalTiltDeg(90)).toBe(90);
  });

  it("folds a retrograde world back, so 157 degrees runs Earth's seasons", () => {
    expect(seasonalTiltDeg(157)).toBeCloseTo(23, 12);
    expect(seasonalTiltDeg(177.4)).toBeCloseTo(2.6, 12);
    expect(seasonalTiltDeg(180)).toBe(0);
  });

  it("peaks where the poles swing furthest", () => {
    for (const deg of [0, 30, 60, 89, 91, 120, 150, 180]) {
      expect(seasonalTiltDeg(deg)).toBeLessThanOrEqual(seasonalTiltDeg(90));
    }
  });

  it("calls a world past a right angle retrograde and nothing under it", () => {
    expect(isRetrograde(89.9)).toBe(false);
    expect(isRetrograde(90)).toBe(false);
    expect(isRetrograde(97.8)).toBe(true);
    expect(isRetrograde(177.4)).toBe(true);
  });
});
