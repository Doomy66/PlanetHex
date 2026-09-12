import { describe, expect, it } from "vitest";
import { visibleColour, visibleWorldFor } from "./visible";
import { latitudeContrastK, temperatureAtLatitude } from "../gen/climate";
import type { PlanetDetail } from "../gen/detail";

/**
 * The visible view of 5.7. Colours are checked by what makes them that colour -
 * greener than it is red, lighter than the ground under it - rather than against
 * exact numbers, so the ramps can be tuned without rewriting the tests.
 */

/** A world's figures set outright, so a test can hold the rest still. */
const world = (over: Partial<PlanetDetail> = {}) =>
  ({
    meanTempK: 287,
    hydrographicsPct: 70,
    pressureAtm: 1,
    axialTiltDeg: 23.4,
    ...over,
  }) as PlanetDetail;

/**
 * Three worlds, each a UWP and the detail values that go with it. The digits and
 * the figures have to agree: a profile saying no water with 70% of the surface wet
 * is a world neither half describes.
 */
const EARTH = { uwp: "A867949-C", detail: {} };
const DESERT = { uwp: "A860949-C", detail: { hydrographicsPct: 1 } };
const ROCK = { uwp: "X400000-0", detail: { hydrographicsPct: 1, pressureAtm: 0 } };

const SEA_LEVEL = 0.5;
/** A land height well above the coastline and well below any snow line. */
const LOWLAND = 0.62;

type World = { uwp: string; detail: Partial<PlanetDetail> };

const at = (w: World, height: number, latDeg: number, over: Partial<PlanetDetail> = {}) =>
  visibleColour(
    height,
    Math.sin((latDeg * Math.PI) / 180),
    false,
    SEA_LEVEL,
    visibleWorldFor(w.uwp, world({ ...w.detail, ...over })),
  );

const isGreen = (c: readonly number[]) => c[1]! > c[0]! && c[1]! > c[2]!;
const isBrown = (c: readonly number[]) => c[0]! > c[2]! + 20;
const isGrey = (c: readonly number[]) => Math.abs(c[0]! - c[2]!) <= 20;
const lightness = (c: readonly number[]) => (c[0]! + c[1]! + c[2]!) / 3;

/* What the ground is made of ---------------------------------------------- */

describe("the visible view", () => {
  it("draws a temperate, watered, breathing world green", () => {
    expect(isGreen(at(EARTH, LOWLAND, 45))).toBe(true);
  });

  it("draws a world with air and no water brown rather than green", () => {
    const c = at(DESERT, LOWLAND, 10);
    expect(isGreen(c)).toBe(false);
    expect(isBrown(c)).toBe(true);
  });

  it("draws a world with neither air nor water grey rather than brown", () => {
    const c = at(ROCK, LOWLAND, 10);
    expect(isGrey(c)).toBe(true);
    expect(isBrown(c)).toBe(false);
  });

  it("draws the sea blue on every world, living or dead", () => {
    for (const uwp of [EARTH, DESERT, ROCK]) {
      const c = at(uwp, 0.2, 20);
      expect(c[2]!).toBeGreaterThan(c[0]!);
      expect(c[2]!).toBeGreaterThan(c[1]!);
    }
  });

  it("draws frozen water white, over sea and over land alike", () => {
    const w = visibleWorldFor(EARTH.uwp, world());
    for (const height of [0.2, LOWLAND]) {
      const ice = visibleColour(height, 0.99, true, SEA_LEVEL, w);
      expect(lightness(ice)).toBeGreaterThan(230);
    }
  });
});

/* What latitude does to it ------------------------------------------------- */

describe("latitude", () => {
  it("leaves the tropics greener than the poles on a temperate world", () => {
    expect(lightness(at(EARTH, LOWLAND, 75))).toBeGreaterThan(
      lightness(at(EARTH, LOWLAND, 45)),
    );
    expect(isGreen(at(EARTH, LOWLAND, 10))).toBe(true);
  });

  it("dries the subtropics out, so a green world still has deserts", () => {
    const belt = at(EARTH, LOWLAND, 26);
    const temperate = at(EARTH, LOWLAND, 48);
    expect(isGreen(temperate)).toBe(true);
    expect(belt[0]! - belt[2]!).toBeGreaterThan(temperate[0]! - temperate[2]!);
  });

  it("puts snow further down the mountains at the poles than at the equator", () => {
    const high = 0.88;
    expect(lightness(at(EARTH, high, 65))).toBeGreaterThan(lightness(at(EARTH, high, 0)));
  });

  it("leaves a world with no water to speak of unfrosted however cold it is", () => {
    const frozen = { meanTempK: 190 };
    expect(lightness(at(ROCK, LOWLAND, 60, frozen))).toBeLessThan(170);
  });
});

/* The temperature model of 5.7.3 ------------------------------------------ */

describe("temperature by latitude", () => {
  const contrast = latitudeContrastK(23.4, 1);

  it("puts Earth's equator near 30C and its poles near -18C", () => {
    const celsius = (sinLat: number) => temperatureAtLatitude(287, contrast, sinLat) - 273.15;
    expect(celsius(0)).toBeGreaterThan(27);
    expect(celsius(0)).toBeLessThan(32);
    expect(celsius(1)).toBeGreaterThan(-21);
    expect(celsius(1)).toBeLessThan(-15);
  });

  it("keeps the world's own mean, so warming one latitude cools another", () => {
    // The average over the sphere is the average in the sine of the latitude,
    // which is what a uniform sample of it comes to.
    const steps = 2001;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      total += temperatureAtLatitude(287, contrast, -1 + (2 * i) / (steps - 1));
    }
    expect(total / steps).toBeCloseTo(287, 1);
  });

  it("flattens the contrast as the axis leans, and turns it over past 55 degrees", () => {
    expect(latitudeContrastK(0, 1)).toBeGreaterThan(latitudeContrastK(30, 1));
    expect(latitudeContrastK(54.74, 1)).toBeCloseTo(0, 1);
    expect(latitudeContrastK(85, 1)).toBeLessThan(0);
  });

  it("has thick air rub the contrast out", () => {
    expect(latitudeContrastK(23.4, 90)).toBeLessThan(latitudeContrastK(23.4, 1) / 4);
  });
});
