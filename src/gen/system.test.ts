import { describe, expect, it } from "vitest";
import { rollUwp } from "../planet";
import { pbgFor } from "./trade";
import { generateSystem, mainWorldSeed, orbitsFor } from "./system";
import { luminosityOf, starsFor } from "./star";

const SEEDS = Array.from({ length: 500 }, (_, i) => `system-${i}`);

describe("generateSystem", () => {
  it("gives the same system to the same seed", () => {
    expect(generateSystem("Regina")).toEqual(generateSystem("Regina"));
    expect(generateSystem("Regina")).not.toEqual(generateSystem("Vland"));
  });

  it("shows the profile the seed rolls and nothing else", () => {
    // The claim the whole level is built to keep. SystemSpec 1.6.1: the system
    // reads its main world's profile and does not write it, so the chart above
    // and the system agree by construction rather than by being checked.
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      expect(system.mainWorld.seed).toBe(mainWorldSeed(seed));
      expect(system.mainWorld.uwp, seed).toBe(rollUwp(mainWorldSeed(seed)));
    }
  });

  it("takes its belts and gas giants from the chart's own figures", () => {
    // SystemSpec 1.6.3: PBG is the contract between the two levels, and this
    // level honours it rather than restating it.
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      expect(system.pbg).toEqual(pbgFor(system.mainWorld.seed, system.mainWorld.uwp));
      expect(system.placed.belts, seed).toBeLessThanOrEqual(system.pbg.belts);
      expect(system.placed.gasGiants, seed).toBeLessThanOrEqual(system.pbg.gasGiants);
    }
  });

  it("places every one of them where there are orbits to spare", () => {
    // The shortfall of StarSystem.placed is for the extreme stars only. A system
    // with room must come out holding exactly what the chart says it holds.
    const roomy = SEEDS.map(generateSystem).filter(
      (system) => system.orbits.length >= system.pbg.belts + system.pbg.gasGiants + 1,
    );
    expect(roomy.length).toBeGreaterThan(SEEDS.length / 2);
    for (const system of roomy) {
      expect(system.placed, system.seed).toEqual({
        belts: system.pbg.belts,
        gasGiants: system.pbg.gasGiants,
      });
    }
  });

  it("puts the main world in one orbit and only one", () => {
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      const worlds = system.orbits.filter((orbit) => orbit.content.kind === "world");
      expect(worlds.length, seed).toBe(1);
      expect(worlds[0]!.index).toBe(system.mainWorld.orbitIndex);
      expect(worlds[0]!.au).toBe(system.mainWorld.au);
    }
  });

  it("leaves some orbits empty", () => {
    // SystemSpec 4.3: a system with every slot filled reads as a generator that
    // could not leave anything out.
    const empty = SEEDS.map(generateSystem).filter((system) =>
      system.orbits.some((orbit) => orbit.content.kind === "empty"),
    );
    expect(empty.length).toBeGreaterThan(SEEDS.length / 2);
  });

  it("keeps the gas giants out where the ices are, given the choice", () => {
    // SystemSpec 4.2. Inner orbits are the fallback for a star with no outer
    // ones to give, not the usual case.
    let outside = 0;
    let inside = 0;
    for (const seed of SEEDS) {
      for (const orbit of generateSystem(seed).orbits) {
        if (orbit.content.kind !== "giant") continue;
        if (orbit.sunEquivalentAu >= 2.7) outside++;
        else inside++;
      }
    }
    expect(outside).toBeGreaterThan(inside * 3);
  });

  it("gives every system at least one orbit", () => {
    for (const seed of SEEDS) {
      expect(generateSystem(seed).orbits.length, seed).toBeGreaterThan(0);
    }
  });
});

describe("orbitsFor", () => {
  it("sweeps the inner orbits of a big hot star", () => {
    // SystemSpec 3.1: a large, hot star scatters what forms close in.
    const sun = orbitsFor(luminosityOf("G", "V"));
    const giant = orbitsFor(luminosityOf("O", "V"));
    expect(sun[0]!.au).toBeLessThan(giant[0]!.au);
  });

  it("leaves a dim star a short run of orbits", () => {
    const dwarf = orbitsFor(luminosityOf("M", "V"));
    const sun = orbitsFor(luminosityOf("G", "V"));
    expect(dwarf.length).toBeLessThan(sun.length);
    expect(dwarf[dwarf.length - 1]!.au).toBeLessThan(sun[sun.length - 1]!.au);
  });

  it("marks the orbits where water could be liquid", () => {
    const sun = orbitsFor(luminosityOf("G", "V"));
    const habitable = sun.filter((orbit) => orbit.habitable);
    expect(habitable.length).toBeGreaterThan(0);
    for (const orbit of habitable) {
      expect(orbit.sunEquivalentAu).toBeGreaterThanOrEqual(0.8);
      expect(orbit.sunEquivalentAu).toBeLessThanOrEqual(1.5);
    }
    // Around the Sun, sunlight-equivalent and actual are the same figure, so the
    // habitable orbit is the one at 1 AU. Anything else means the two readings
    // of a distance have come apart.
    expect(habitable.some((orbit) => orbit.au === 1)).toBe(true);
  });

  it("has a habitable orbit closer in for a dimmer star", () => {
    const dwarf = orbitsFor(luminosityOf("M", "V")).filter((o) => o.habitable);
    const sun = orbitsFor(luminosityOf("G", "V")).filter((o) => o.habitable);
    if (dwarf.length > 0) expect(dwarf[0]!.au).toBeLessThan(sun[0]!.au);
  });

  it("never runs dry, at either end of what a star can be", () => {
    const brightest = luminosityOf("O", "Ia");
    const dimmest = luminosityOf("M", "D");
    expect(orbitsFor(brightest).length).toBeGreaterThan(0);
    expect(orbitsFor(dimmest).length).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      expect(orbitsFor(starsFor(seed).primary.luminosity).length, seed).toBeGreaterThan(0);
    }
  });
});
