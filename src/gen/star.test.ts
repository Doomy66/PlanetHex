import { describe, expect, it } from "vitest";
import {
  luminosityOf,
  starLabel,
  starsFor,
  starsLabel,
  type SpectralClass,
  type StarSize,
} from "./star";
import { parseUwp, rollUwp, seedFrom } from "../planet";

/** Enough seeds that the rare draws come up. */
const SEEDS = Array.from({ length: 2000 }, (_, i) => `system-${i}`);

/** The population digit of the world a system's seed rolls for itself. */
const populationOf = (seed: string): number =>
  parseUwp(rollUwp(seedFrom(seed, "world")))?.population ?? 0;

const EMPTY = SEEDS.filter((seed) => populationOf(seed) === 0);
const SETTLED = SEEDS.filter((seed) => populationOf(seed) >= 6);

const shareOf = (seeds: readonly string[], want: readonly SpectralClass[]): number =>
  seeds.filter((seed) => want.includes(starsFor(seed).primary.spectral)).length / seeds.length;

describe("starsFor", () => {
  it("gives the same stars to the same seed", () => {
    expect(starsFor("Regina")).toEqual(starsFor("Regina"));
    expect(starsFor("Regina")).not.toEqual(starsFor("Vland"));
  });

  it("never makes the companion the brighter of the two", () => {
    // SystemSpec 2.3. The brighter of two stars is the primary by definition,
    // so a companion that outshone it would have the pair named backwards.
    for (const seed of SEEDS) {
      const { primary, companion } = starsFor(seed);
      if (companion === null) continue;
      expect(companion.luminosity, seed).toBeLessThanOrEqual(primary.luminosity);
    }
  });

  it("gives about one system in three a companion", () => {
    const withOne = SEEDS.filter((seed) => starsFor(seed).companion !== null).length;
    const share = withOne / SEEDS.length;
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.39);
  });

  it("puts a companion inside every orbit or outside all of them", () => {
    // SystemSpec 2.4: nothing orbits between the two stars, which is what lets
    // a system have one set of orbits rather than three.
    for (const seed of SEEDS.slice(0, 200)) {
      const { companion, companionOrbit } = starsFor(seed);
      expect(companionOrbit === null).toBe(companion === null);
      if (companionOrbit !== null) expect(["close", "far"]).toContain(companionOrbit);
    }
  });

  it("leaves an empty system the sky's own star", () => {
    // SystemSpec 2.2: most of the sky is K and M dwarfs, and a chart where every
    // third system is a blue giant is a chart nobody believes.
    expect(EMPTY.length).toBeGreaterThan(50);
    expect(shareOf(EMPTY, ["M"])).toBeGreaterThan(0.4);
    expect(shareOf(EMPTY, ["M", "K"])).toBeGreaterThan(0.7);
  });

  it("puts a settled world round a star worth settling", () => {
    // SystemSpec 2.2.2. A red dwarf's habitable orbit is a tenth of an AU out,
    // inside the reach of its tides, so the world in it is locked and flared on.
    // Nobody built a class A starport there while a G was going spare.
    expect(SETTLED.length).toBeGreaterThan(50);
    expect(shareOf(SETTLED, ["G", "K", "F"])).toBeGreaterThan(0.7);
    expect(shareOf(SETTLED, ["M"])).toBeLessThan(0.15);
    // And it is a lean rather than a rule: the awkward ones still happen.
    expect(shareOf(SETTLED, ["M"])).toBeGreaterThan(0);
  });

  it("keeps a settled world off a supergiant and a cinder", () => {
    // SystemSpec 2.2.2: a supergiant has a few million years to live and a white
    // dwarf has already killed everything it had.
    const sizes = new Map<StarSize, number>();
    for (const seed of SETTLED) {
      const { size } = starsFor(seed).primary;
      sizes.set(size, (sizes.get(size) ?? 0) + 1);
    }
    expect((sizes.get("V") ?? 0) / SETTLED.length).toBeGreaterThan(0.85);
    expect((sizes.get("Ia") ?? 0) + (sizes.get("Ib") ?? 0)).toBe(0);
  });

  it("keeps O and B to the trace Traveller's own table leaves them", () => {
    // In Book 6 they cannot be rolled without the referee adding a modifier to
    // reach them. A sector of 1,280 hexes still holds a handful, which is what a
    // landmark is for.
    expect(shareOf(SEEDS, ["O", "B"])).toBeLessThan(0.02);
    expect(shareOf(EMPTY, ["O", "B"])).toBeLessThan(0.01);
  });

  it("never draws a size its class cannot be", () => {
    // Traveller's blank columns, and it is right about both: a K or M subgiant
    // would have to be older than the universe, and a subdwarf hotter than an F
    // is not a thing the sky contains.
    for (const seed of SEEDS) {
      for (const star of [starsFor(seed).primary, starsFor(seed).companion]) {
        if (star === null) continue;
        if (star.size === "IV") expect(["K", "M"], seed).not.toContain(star.spectral);
        if (star.size === "VI") expect(["O", "B", "A"], seed).not.toContain(star.spectral);
      }
    }
  });
});

describe("luminosityOf", () => {
  it("puts the main sequence in order, hottest brightest", () => {
    const order: SpectralClass[] = ["M", "K", "G", "F", "A", "B", "O"];
    for (let i = 1; i < order.length; i++) {
      expect(luminosityOf(order[i]!, "V")).toBeGreaterThan(luminosityOf(order[i - 1]!, "V"));
    }
  });

  it("makes a giant brighter than its main sequence self and a cinder dimmer", () => {
    expect(luminosityOf("G", "III")).toBeGreaterThan(luminosityOf("G", "V"));
    expect(luminosityOf("G", "D")).toBeLessThan(luminosityOf("G", "V"));
  });
});

describe("starsLabel", () => {
  it("writes what a sector line's Stars column holds", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const stars = starsFor(seed);
      for (const star of [stars.primary, stars.companion]) {
        if (star === null) continue;
        expect(starLabel(star), seed).toMatch(/^(D|[OBAFGKM]\d (Ia|Ib|II|III|IV|V|VI))$/);
      }
      const label = starsLabel(stars);
      expect(label.split(" ").length, label).toBeLessThanOrEqual(4);
    }
  });
});
