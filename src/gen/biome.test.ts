import { describe, expect, it } from "vitest";
import { biomeAt, biomeWorldFor, coverAt, temperatureAt } from "./biome";
import type { PlanetDetail } from "./detail";

/**
 * The biome model of 5.8. What is checked here is that a hex is named after what
 * it is made of rather than after how high it is, and that the same three factors
 * 5.6 reads for the whole world name a place when they are read at that place.
 */

const world = (over: Partial<PlanetDetail> = {}) =>
  ({
    meanTempK: 287,
    hydrographicsPct: 70,
    pressureAtm: 1,
    axialTiltDeg: 23.4,
    ...over,
  }) as PlanetDetail;

const EARTH = biomeWorldFor("A867949-C", world());
const ROCK = biomeWorldFor("X400000-0", world({ hydrographicsPct: 1, pressureAtm: 0 }));
const DESERT = biomeWorldFor("A860949-C", world({ hydrographicsPct: 1 }));

const sinOf = (latDeg: number) => Math.sin((latDeg * Math.PI) / 180);
const LOWLAND = 0.62;

describe("naming the ground", () => {
  it("names the sea by how deep it is", () => {
    expect(biomeAt(EARTH, 0.1, 0, false)).toBe("Deep sea");
    expect(biomeAt(EARTH, 0.4, 0, false)).toBe("Sea");
    expect(biomeAt(EARTH, 0.49, 0, false)).toBe("Shelf sea");
  });

  it("lets ice overrule whatever is under it", () => {
    expect(biomeAt(EARTH, 0.2, sinOf(85), true)).toBe("Sea ice");
    expect(biomeAt(EARTH, LOWLAND, sinOf(85), true)).toBe("Ice cap");
  });

  it("reads a temperate world from rainforest at the equator to tundra at the poles", () => {
    expect(biomeAt(EARTH, LOWLAND, sinOf(2), false)).toBe("Rainforest");
    expect(biomeAt(EARTH, LOWLAND, sinOf(45), false)).toBe("Forest");
    expect(biomeAt(EARTH, LOWLAND, sinOf(62), false)).toBe("Tundra");
  });

  it("puts a desert in the subtropics of a world that is forest either side of it", () => {
    expect(biomeAt(EARTH, LOWLAND, sinOf(26), false)).toMatch(/Savannah|Grassland|Desert/);
  });

  it("names a world with air and no water for its dust, and one with neither for its stone", () => {
    expect(biomeAt(DESERT, LOWLAND, sinOf(10), false)).toMatch(/desert|Desert/);
    expect(biomeAt(ROCK, LOWLAND, sinOf(10), false)).toBe("Bare rock");
  });

  it("strips the highest ground back to rock where there is no snow to cap it", () => {
    expect(biomeAt(ROCK, 0.97, sinOf(5), false)).toBe("Bare rock");
  });

  it("caps an equatorial summit with snow on a world that has water", () => {
    // Kilimanjaro sits three degrees off the equator and carries ice. The snow
    // line of 5.7.4 is high there rather than absent.
    expect(biomeAt(EARTH, 0.97, sinOf(3), false)).toBe("Snowfield");
  });

  it("is not the terrain band: one hex, two different questions", () => {
    // The same normalised height, two latitudes, two different grounds. A band
    // read off height alone cannot tell these apart, which is why 5.8.2 is a
    // second answer rather than a replacement for the first.
    expect(biomeAt(EARTH, LOWLAND, sinOf(2), false)).not.toBe(
      biomeAt(EARTH, LOWLAND, sinOf(62), false),
    );
  });
});

describe("the model behind it", () => {
  it("reads the warmth at the place rather than at the world's mean", () => {
    expect(temperatureAt(EARTH, 0)).toBeGreaterThan(temperatureAt(EARTH, sinOf(60)));
  });

  it("leaves a world with no air bare at every latitude", () => {
    for (const lat of [0, 30, 60, 85]) {
      expect(coverAt(ROCK, sinOf(lat))).toBe(0);
    }
  });
});
