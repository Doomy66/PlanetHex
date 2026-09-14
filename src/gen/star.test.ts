import { describe, expect, it } from "vitest";
import { luminosityOf, starLabel, starsFor, starsLabel, type SpectralClass } from "./star";

/** Enough seeds that the rare draws come up. */
const SEEDS = Array.from({ length: 2000 }, (_, i) => `system-${i}`);

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

  it("leans towards the small and the long-lived", () => {
    // SystemSpec 2.2: most of the sky is K and M dwarfs, and a chart where every
    // third system is a blue giant is a chart nobody believes.
    const count = new Map<SpectralClass, number>();
    for (const seed of SEEDS) {
      const { spectral } = starsFor(seed).primary;
      count.set(spectral, (count.get(spectral) ?? 0) + 1);
    }
    const m = count.get("M") ?? 0;
    const o = count.get("O") ?? 0;
    expect(m / SEEDS.length).toBeGreaterThan(0.35);
    expect(m).toBeGreaterThan(count.get("G") ?? 0);
    expect(o / SEEDS.length).toBeLessThan(0.03);
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
