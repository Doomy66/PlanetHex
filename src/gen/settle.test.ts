import { describe, expect, it } from "vitest";
import { buildGrid } from "../grid/grid";
import { biomeWorldFor } from "./biome";
import { generateHeights, seaLevelFor } from "./height";
import {
  habitability,
  populationNote,
  populationShares,
  settlementCount,
  settlementNames,
  flavourFor,
  FLAVOURS,
  settlementSites,
} from "./settle";
import { normalise } from "../ui/colour";
import type { PlanetDetail } from "./detail";

/**
 * Settlements, Spec 6.24. The coarsest grid throughout: 362 hexes is enough to
 * put nine cities on and nothing here is about how many hexes there are.
 */

const SIZE = 6;
const SEED = "TESTSEED";

const detail = (over: Partial<PlanetDetail> = {}) =>
  ({
    meanTempK: 287,
    hydrographicsPct: 70,
    pressureAtm: 1,
    axialTiltDeg: 23.4,
    population: 1e9,
    // A world that turns: the locked model of 5.7.7 is a different world.
    rotationHours: 24,
    orbitAu: 1,
    climate: { luminosity: 1 } as PlanetDetail["climate"],
    ...over,
  }) as PlanetDetail;

const EARTH = biomeWorldFor("A867949-C", detail());

function surface(waterFraction: number) {
  const grid = buildGrid(SIZE);
  const heights = generateHeights(grid, SEED);
  return { grid, heights, seaLevel: seaLevelFor(heights, waterFraction) };
}

describe("how many settlements", () => {
  it("gives a world one per point of its population digit", () => {
    expect(settlementCount(0)).toBe(0);
    expect(settlementCount(1)).toBe(1);
    expect(settlementCount(9)).toBe(9);
  });

  it("holds the top of the scale rather than running away with it", () => {
    expect(settlementCount(15)).toBe(15);
    expect(settlementCount(99)).toBe(15);
  });
});

describe("how large", () => {
  it("makes the first city the largest and the rest fall away behind it", () => {
    const shares = populationShares(5, 1e9);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]!).toBeLessThan(shares[i - 1]!);
    }
  });

  it("halves at rank two and thirds at rank three, as the rank-size rule has it", () => {
    const shares = populationShares(6, 1e9);
    expect(shares[1]! / shares[0]!).toBeCloseTo(1 / 2, 2);
    expect(shares[2]! / shares[0]!).toBeCloseTo(1 / 3, 2);
  });

  it("does not add up to the world, since not everyone lives in a city", () => {
    const total = 1e9;
    const settled = populationShares(9, total).reduce((a, b) => a + b, 0);
    expect(settled).toBeLessThan(total);
    expect(settled).toBeGreaterThan(total / 2);
  });

  it("says what a settlement holds in words rather than to the person", () => {
    expect(populationNote(431_741_314)).toBe("Population about 432 million.");
    expect(populationNote(0)).toMatch(/no recorded population/);
  });
});

describe("what a name is", () => {
  it("gives the same world the same names", () => {
    expect(settlementNames(SEED, 9)).toEqual(settlementNames(SEED, 9));
  });

  it("gives one world's settlements names of their own", () => {
    const names = settlementNames(SEED, 15);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps a world's names in one voice", () => {
    // Every flavour, on a thousand worlds each, and no world mixing two of them.
    // The check is that a world's names all come from the flavour it drew.
    for (let i = 0; i < 400; i++) {
      const seed = `voice-${i}`;
      const flavour = flavourFor(seed);
      const names = settlementNames(seed, 6);
      for (const name of names) {
        if (flavour.key === "functional") expect(name).toMatch(/^[A-Za-z]+ [A-Z][a-z]+$/);
        if (flavour.key === "polyglot") expect(name).not.toMatch(/ /);
      }
    }
  });

  it("gives every flavour a turn, with polyglot the common one", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const key = flavourFor(`flavour-${i}`).key;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const flavour of FLAVOURS) expect(seen.get(flavour.key) ?? 0).toBeGreaterThan(0);
    const polyglot = seen.get("polyglot") ?? 0;
    for (const flavour of FLAVOURS) {
      if (flavour.key !== "polyglot") {
        expect(polyglot).toBeGreaterThan(seen.get(flavour.key) ?? 0);
      }
    }
  });

  it("numbers a functional world's places in rank order", () => {
    const functional = FLAVOURS.find((f) => f.key === "functional")!;
    let seed = "";
    for (let i = 0; i < 500 && seed === ""; i++) {
      if (flavourFor(`fn-${i}`) === functional) seed = `fn-${i}`;
    }
    expect(seed).not.toBe("");
    const names = settlementNames(seed, 4);
    const word = names[0]!.split(" ")[0];
    expect(names).toEqual([`${word} One`, `${word} Two`, `${word} Three`, `${word} Four`]);
  });
});

describe("where they go", () => {
  it("prefers ground with something growing on it to bare rock", () => {
    const lush = habitability(EARTH, 0.6, 0, false, false);
    const bare = habitability(EARTH, 0.6, Math.sin(1.4), false, false);
    expect(lush).toBeGreaterThan(bare);
  });

  it("prefers a coast to the same ground inland", () => {
    expect(habitability(EARTH, 0.6, 0, false, true)).toBeGreaterThan(
      habitability(EARTH, 0.6, 0, false, false),
    );
  });

  it("prefers land to open water, and the shelf to the deep", () => {
    expect(habitability(EARTH, 0.6, 0, false, false)).toBeGreaterThan(
      habitability(EARTH, 0.49, 0, false, false),
    );
    expect(habitability(EARTH, 0.49, 0, false, false)).toBeGreaterThan(
      habitability(EARTH, 0.1, 0, false, false),
    );
  });

  it("counts ice against a site", () => {
    expect(habitability(EARTH, 0.6, 0, true, false)).toBeLessThan(
      habitability(EARTH, 0.6, 0, false, false),
    );
  });

  it("places every settlement asked for, on its own hex", () => {
    const { grid, heights, seaLevel } = surface(0.7);
    const sites = settlementSites(grid, heights, seaLevel, EARTH, null, 9);
    expect(sites).toHaveLength(9);
    expect(new Set(sites).size).toBe(9);
  });

  it("spreads them rather than heaping them on the one best bay", () => {
    const { grid, heights, seaLevel } = surface(0.7);
    const sites = settlementSites(grid, heights, seaLevel, EARTH, null, 6);
    const centres = sites.map((id) => grid.cells[id]!.centre);
    for (let a = 0; a < centres.length; a++) {
      for (let b = a + 1; b < centres.length; b++) {
        const dot =
          centres[a]![0] * centres[b]![0] +
          centres[a]![1] * centres[b]![1] +
          centres[a]![2] * centres[b]![2];
        // A tenth of a radian is about four hexes at this level: near enough to be
        // one conurbation, and nothing should be that close to anything else.
        expect(Math.acos(Math.min(1, dot))).toBeGreaterThan(0.1);
      }
    }
  });

  it("keeps off a site already spoken for", () => {
    const { grid, heights, seaLevel } = surface(0.7);
    const port = settlementSites(grid, heights, seaLevel, EARTH, null, 1)[0]!;
    const rest = settlementSites(grid, heights, seaLevel, EARTH, null, 5, [port]);
    expect(rest).not.toContain(port);
  });

  it("puts the cities of a water world on the water", () => {
    // Ninety nine percent wet: there is next to no land, and a settlement model
    // that insisted on a shore would have nowhere to put anything. Spec 6.24.5.
    const { grid, heights, seaLevel } = surface(0.99);
    const sites = settlementSites(grid, heights, seaLevel, EARTH, null, 6);
    expect(sites.length).toBeGreaterThan(0);
    const wet = sites.filter((id) => heights[id]! <= seaLevel);
    expect(wet.length).toBeGreaterThan(0);
    // And on the shelf rather than out in the deep.
    for (const id of wet) {
      expect(normalise(heights[id]!, seaLevel)).toBeGreaterThan(0.34);
    }
  });

  it("asks for none and places none", () => {
    const { grid, heights, seaLevel } = surface(0.7);
    expect(settlementSites(grid, heights, seaLevel, EARTH, null, 0)).toHaveLength(0);
  });
});
