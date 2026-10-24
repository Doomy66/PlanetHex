import { describe, expect, it } from "vitest";
import { blankPlanet, formatUwp, newPlanet, parseUwp, parsePlanet, rollUwp } from "./planet";

/** A spread of seeds, enough that every branch of the rules is exercised. */
const WORLDS = Array.from({ length: 500 }, (_, i) => {
  const seed = `roll-${i}`;
  return { seed, uwp: rollUwp(seed), w: parseUwp(rollUwp(seed))! };
});

describe("blankPlanet", () => {
  it("rolls nothing", () => {
    // AppSpec 2.5: the landing page is a chooser, and a window that has not
    // opened a planet must not have generated one. A blank seed is the tell.
    const planet = blankPlanet();
    expect(planet.seed).toBe("");
    expect(planet.uwp).toBe("");
    expect(planet.pois).toHaveLength(0);
  });

  it("is a different record each time", () => {
    // Shared would mean two windows editing one planet, and the record is
    // written into rather than replaced.
    expect(blankPlanet()).not.toBe(blankPlanet());
  });
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

describe("pseudo-hex digits", () => {
  // Traveller's pseudo-hex runs on past F up the alphabet, leaving out I and O
  // so they cannot be read as 1 and 0. Nothing rolled here goes past F - every
  // limit at 6.7.1 stops at 15 - so this is about profiles arriving from
  // outside, where a tech level of G or H is ordinary.

  it("reads and writes the ordinary sixteen unchanged", () => {
    // The whole point of leaving 0-F alone: no world already saved moves.
    for (const [at, digit] of [..."0123456789ABCDEF"].entries()) {
      const uwp = `A${digit}00000-0`;
      expect(parseUwp(uwp)!.size, uwp).toBe(at);
      expect(formatUwp(parseUwp(uwp)!), uwp).toBe(uwp);
    }
  });

  it("carries on up the alphabet past F", () => {
    expect(parseUwp("A000000-G")!.tech).toBe(16);
    expect(parseUwp("A000000-H")!.tech).toBe(17);
    // J, not I: the next digit after H is worth 18.
    expect(parseUwp("A000000-J")!.tech).toBe(18);
  });

  it("writes a tech level above F as one character", () => {
    // toString(16) wrote 16 as "10", which made a nine-character UWP that
    // parseUwp then refused - so a canon high-tech world broke on the way back.
    const high = { ...parseUwp("A000000-0")!, tech: 17 };
    expect(formatUwp(high)).toBe("A000000-H");
    expect(parseUwp(formatUwp(high))!.tech).toBe(17);
  });

  it("refuses I and O, which are not digits", () => {
    expect(parseUwp("A000000-I")).toBeNull();
    expect(parseUwp("A000000-O")).toBeNull();
    expect(parseUwp("AI00000-0")).toBeNull();
  });

  it("reads the digits published data actually uses", () => {
    // A size above 10 and a government above 13 are past anything rollUwp can
    // produce, and both appear in published sectors. They parse, because
    // parseUwp says what a profile is rather than what the dice can roll.
    const odd = parseUwp("A87A9F9-C");
    expect(odd).not.toBeNull();
    expect(odd!.hydrographics).toBe(10);
    expect(odd!.government).toBe(15);
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

  it("carries the star a system put the world around", () => {
    // PlanetSpec 6.15.13.2: a save holds everything its surface is built from,
    // so a world lifted out of its system opens as the world that system made.
    expect(save({ luminosity: 0.02 }).luminosity).toBe(0.02);
    expect(save({ orbitAu: 0.14, luminosity: 0.02 }).orbitAu).toBe(0.14);
  });

  it("reads a save written before stars as a world around the Sun", () => {
    // PlanetSpec 6.15.13.1. Nothing in an old file changes, and nothing in an
    // old file has to be rewritten.
    const { luminosity: _dropped, ...older } = newPlanet("Older");
    expect(parsePlanet(JSON.stringify(older)).luminosity).toBeNull();
  });
});
