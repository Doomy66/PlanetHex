import { describe, expect, it } from "vitest";
import { DEFAULT_VERDANCY, verdancyFor } from "./life";
import type { PlanetDetail } from "./detail";
import { heightColour } from "../ui/colour";

/**
 * A world's water and temperature set outright, so a test can hold them still and
 * move the atmosphere digit. Temperate and well watered unless a test says
 * otherwise, which is the state that leaves the air the only thing in play.
 */
const world = (over: Partial<PlanetDetail> = {}) =>
  ({ meanTempK: 287, hydrographicsPct: 70, ...over }) as PlanetDetail;

/** A UWP with the atmosphere digit set and everything else Earth-like. */
const air = (digit: string) => `A8${digit}7A69-F`;

const rgb = (colour: string) => colour.match(/\d+/g)!.map(Number) as [number, number, number];

/** A land height, well above the coastline but below the snow. */
const LOWLAND = 0.62;

describe("verdancy", () => {
  it("is highest on a temperate, watered world with breathable air", () => {
    expect(verdancyFor(air("6"), world())).toBe(1);
  });

  it("is nothing on a world with no air to hold water on the surface", () => {
    expect(verdancyFor(air("0"), world())).toBe(0);
    expect(verdancyFor(air("1"), world())).toBe(0);
  });

  it("is nothing on a world whose air is corrosive or insidious", () => {
    expect(verdancyFor(air("B"), world())).toBe(0);
    expect(verdancyFor(air("C"), world())).toBe(0);
  });

  it("costs a taint little, since what a traveller cannot breathe a plant may", () => {
    expect(verdancyFor(air("7"), world())).toBeGreaterThan(0.8);
  });

  it("is nothing on a desert world, whatever it is breathing", () => {
    expect(verdancyFor(air("6"), world({ hydrographicsPct: 2 }))).toBe(0);
  });

  it("grows with the water a world has, up to the point it is watered everywhere", () => {
    const dry = verdancyFor(air("6"), world({ hydrographicsPct: 10 }));
    const damp = verdancyFor(air("6"), world({ hydrographicsPct: 20 }));
    expect(damp).toBeGreaterThan(dry);
    expect(dry).toBeGreaterThan(0);
    expect(verdancyFor(air("6"), world({ hydrographicsPct: 90 }))).toBe(1);
  });

  it("is nothing on a world frozen hard or scorched, where no water is liquid", () => {
    expect(verdancyFor(air("6"), world({ meanTempK: 240 }))).toBe(0);
    expect(verdancyFor(air("6"), world({ meanTempK: 345 }))).toBe(0);
  });

  it("falls off either side of the temperate band rather than stopping dead", () => {
    const cold = verdancyFor(air("6"), world({ meanTempK: 260 }));
    const hot = verdancyFor(air("6"), world({ meanTempK: 325 }));
    for (const v of [cold, hot]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("gives an unreadable profile a middling world rather than an Earth", () => {
    expect(verdancyFor("not a uwp", world())).toBe(DEFAULT_VERDANCY);
  });
});

describe("the land ramp", () => {
  it("draws a lush world green: more green in it than red", () => {
    const [r, g] = rgb(heightColour(LOWLAND, 0.5, false, 1));
    expect(g).toBeGreaterThan(r);
  });

  it("draws a bare world in yellows and browns: more red in it than green", () => {
    const [r, g, b] = rgb(heightColour(LOWLAND, 0.5, false, 0));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("puts a marginal world between the two rather than at either end", () => {
    const half = rgb(heightColour(LOWLAND, 0.5, false, 0.5));
    const green = rgb(heightColour(LOWLAND, 0.5, false, 1));
    const bare = rgb(heightColour(LOWLAND, 0.5, false, 0));
    for (const i of [0, 1, 2]) {
      const [lo, hi] = green[i]! < bare[i]! ? [green[i]!, bare[i]!] : [bare[i]!, green[i]!];
      expect(half[i]!).toBeGreaterThan(lo);
      expect(half[i]!).toBeLessThan(hi);
    }
  });

  it("leaves the sea alone, since water is water on a dead world too", () => {
    for (const h of [0.1, 0.3, 0.5]) {
      expect(heightColour(h, 0.5, false, 0)).toBe(heightColour(h, 0.5, false, 1));
    }
  });

  it("keeps the coastline in the same place on a bare world", () => {
    // Spec 5.2: the step at sea level is the coastline, and blending the land
    // ramps cannot be allowed to move it.
    for (const v of [0, 0.5, 1]) {
      const [, , seaB] = rgb(heightColour(0.5, 0.5, false, v));
      const [, , landB] = rgb(heightColour(0.5002, 0.5, false, v));
      expect(seaB).toBeGreaterThan(landB);
    }
  });

  it("still runs to pale peaks, so height reads on a bare world as on a green one", () => {
    const bright = (c: string) => rgb(c).reduce((a, x) => a + x, 0);
    for (const v of [0, 1]) {
      expect(bright(heightColour(1, 0.5, false, v))).toBeGreaterThan(
        bright(heightColour(0.62, 0.5, false, v)),
      );
    }
  });
});
