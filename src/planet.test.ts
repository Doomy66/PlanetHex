import { describe, expect, it } from "vitest";
import { newPlanet, parseUwp, parsePlanet, rollUwp } from "./planet";

/** A spread of seeds, enough that every branch of the rules is exercised. */
const WORLDS = Array.from({ length: 500 }, (_, i) => {
  const seed = `roll-${i}`;
  return { seed, uwp: rollUwp(seed), w: parseUwp(rollUwp(seed))! };
});

describe("rollUwp", () => {
  it("produces a readable profile from every seed", () => {
    for (const { uwp, w } of WORLDS) {
      expect(w, uwp).not.toBeNull();
    }
  });

  it("gives the same world to the same seed", () => {
    expect(rollUwp("Regina")).toBe(rollUwp("Regina"));
    expect(rollUwp("Regina")).not.toBe(rollUwp("Vland"));
  });

  it("keeps every position inside its range", () => {
    for (const { uwp, w } of WORLDS) {
      expect("ABCDEX", uwp).toContain(w.starport);
      expect(w.size, uwp).toBeGreaterThanOrEqual(0);
      expect(w.size, uwp).toBeLessThanOrEqual(10);
      expect(w.atmosphere, uwp).toBeLessThanOrEqual(15);
      expect(w.hydrographics, uwp).toBeLessThanOrEqual(10);
      expect(w.population, uwp).toBeLessThanOrEqual(12);
      expect(w.government, uwp).toBeLessThanOrEqual(13);
      expect(w.law, uwp).toBeLessThanOrEqual(9);
      expect(w.tech, uwp).toBeLessThanOrEqual(15);
      for (const value of Object.values(w)) {
        if (typeof value === "number") expect(value, uwp).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("chains the atmosphere off the size, within the 2D swing", () => {
    for (const { uwp, w } of WORLDS) {
      if (w.size === 0) continue;
      if (w.atmosphere > 0 && w.atmosphere < 15) {
        expect(w.atmosphere, uwp).toBeGreaterThanOrEqual(w.size - 5);
        expect(w.atmosphere, uwp).toBeLessThanOrEqual(w.size + 5);
      }
    }
  });

  it("leaves a world with no gravity well no air and no water", () => {
    const airless = WORLDS.filter(({ w }) => w.size === 0);
    expect(airless.length).toBeGreaterThan(0);
    for (const { uwp, w } of airless) {
      expect(w.atmosphere, uwp).toBe(0);
      expect(w.hydrographics, uwp).toBe(0);
    }
    for (const { uwp, w } of WORLDS.filter(({ w }) => w.size === 1)) {
      expect(w.hydrographics, uwp).toBe(0);
    }
  });

  it("leaves an atmosphere that cannot hold water dry or nearly so", () => {
    // The -4 DM cannot force a desert on its own, but it caps what is reachable:
    // 2D-7+size-4, so at most size+1 against size+5 for an atmosphere that holds.
    for (const { uwp, w } of WORLDS) {
      if (![0, 1, 10, 11, 12].includes(w.atmosphere)) continue;
      expect(w.hydrographics, uwp).toBeLessThanOrEqual(Math.max(0, w.size + 1));
    }
  });

  it("gives an empty world no government, no laws and no industry", () => {
    const empty = WORLDS.filter(({ w }) => w.population === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const { uwp, w } of empty) {
      expect(w.government, uwp).toBe(0);
      expect(w.law, uwp).toBe(0);
      expect(w.tech, uwp).toBe(0);
    }
  });

  it("chains the government off the population and the law off the government", () => {
    for (const { uwp, w } of WORLDS) {
      if (w.population === 0) continue;
      if (w.government > 0 && w.government < 13) {
        expect(w.government, uwp).toBeGreaterThanOrEqual(w.population - 5);
        expect(w.government, uwp).toBeLessThanOrEqual(w.population + 5);
      }
      if (w.law > 0 && w.law < 9) {
        expect(w.law, uwp).toBeGreaterThanOrEqual(w.government - 5);
        expect(w.law, uwp).toBeLessThanOrEqual(w.government + 5);
      }
    }
  });

  it("reaches every starport class", () => {
    const seen = new Set(WORLDS.map(({ w }) => w.starport));
    expect([...seen].sort().join("")).toBe("ABCDEX");
  });

  it("spreads the size over the whole 2D-2 range", () => {
    const sizes = WORLDS.map(({ w }) => w.size);
    expect(Math.min(...sizes)).toBe(0);
    expect(Math.max(...sizes)).toBe(10);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    // 2D-2 centres on 5. A flat draw over 0..10 would too, so this is a sanity
    // check on the dice rather than a test of the curve.
    expect(mean).toBeGreaterThan(4);
    expect(mean).toBeLessThan(6);
  });

  it("builds a 2D curve rather than a flat draw", () => {
    const sizes = WORLDS.map(({ w }) => w.size);
    const count = (n: number) => sizes.filter((s) => s === n).length;
    // 5 is six times as likely as 0 or 10 on 2D. Flat digits would make them equal.
    expect(count(5)).toBeGreaterThan(count(0) * 2);
    expect(count(5)).toBeGreaterThan(count(10) * 2);
  });

  it("ties the tech level to the starport", () => {
    const techAt = (port: string) => {
      const worlds = WORLDS.filter(({ w }) => w.starport === port && w.population > 0);
      return worlds.reduce((sum, { w }) => sum + w.tech, 0) / worlds.length;
    };
    expect(techAt("A")).toBeGreaterThan(techAt("X"));
  });
});

describe("the world settings a save carries", () => {
  const save = (extra: Record<string, unknown>) =>
    parsePlanet(JSON.stringify({ ...newPlanet("Saved"), ...extra }));

  it("starts a new planet on the rolled values", () => {
    const planet = newPlanet("Fresh");
    expect(planet.craters).toBeNull();
    expect(planet.tiltDeg).toBeNull();
  });

  it("reads a crater count back off a save", () => {
    expect(save({ craters: 640 }).craters).toBe(640);
    // Zero is a decision the referee made, not an absent one.
    expect(save({ craters: 0 }).craters).toBe(0);
  });

  it("leaves a save written before craters existed on its rolled count", () => {
    const { craters: _dropped, ...older } = newPlanet("Older");
    expect(parsePlanet(JSON.stringify(older)).craters).toBeNull();
  });
});
