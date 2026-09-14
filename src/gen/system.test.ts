import { describe, expect, it } from "vitest";
import { parseUwp, rollUwp } from "../planet";
import { pbgFor } from "./trade";
import { generateSystem, mainWorldSeed, orbitsFor, worldSettings } from "./system";
import { planetDetail } from "./detail";
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
    // Other worlds there may be, under section 6, but exactly one of them is the
    // world the chart drew and the sector line describes. SystemSpec 1.5.
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      const main = system.orbits.filter(
        (orbit) => orbit.content.kind === "world" && orbit.content.main,
      );
      expect(main.length, seed).toBe(1);
      expect(main[0]!.index).toBe(system.mainWorld.orbitIndex);
      expect(main[0]!.au).toBe(system.mainWorld.au);
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

  it("hands a world everything its surface is built from", () => {
    // The world has to be openable on its own, with no system anywhere near it.
    // PlanetSpec 6.15.13: what a system knows that a planet cannot work out for
    // itself is the star, so the star goes in the save beside the orbit.
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      const settings = worldSettings(system);
      expect(settings.orbitAu, seed).toBe(system.mainWorld.au);
      // What lights the orbits, which is both stars of a close pair. 2.4.2.
      expect(settings.luminosity, seed).toBe(system.mainWorld.luminosity);

      // Opened from nothing but those settings, the world comes up in the orbit
      // the system put it in, at the temperature that orbit implies.
      const alone = planetDetail(system.mainWorld.seed, system.mainWorld.uwp, settings);
      expect(alone.orbitAu, seed).toBeCloseTo(system.mainWorld.au, 6);
      expect(alone.climate.luminosity, seed).toBe(settings.luminosity);
      expect(Number.isFinite(alone.meanTempK), seed).toBe(true);
    }
  });

  it("puts a world in the habitable zone at a temperature water survives", () => {
    // The point of carrying the star: the same tenth of an AU is a furnace
    // around one star and a cinder around another, and only the pair of figures
    // says which. A world in a marked habitable orbit has to come out temperate
    // whatever kind of star it is.
    let checked = 0;
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      const home = system.orbits[
        system.orbits.findIndex((orbit) => orbit.index === system.mainWorld.orbitIndex)
      ]!;
      if (!home.habitable) continue;
      checked++;
      const alone = planetDetail(
        system.mainWorld.seed,
        system.mainWorld.uwp,
        worldSettings(system),
      );
      // The sunlight, not the world's own air: a habitable orbit says how much
      // light falls there, and a world with a runaway greenhouse is still an
      // oven in one. So the greenhouse is taken back off before the check.
      const sunlit = alone.meanTempK - alone.climate.greenhouseK;
      // A wide band, because the habitable zone is wide: its outer edge is where
      // water stays liquid under a thick enough atmosphere rather than where
      // bare sunlight alone would keep it so, and a bright cloudy world reflects
      // a third of what falls on it.
      expect(sunlit, `${seed} at ${home.au} AU`).toBeGreaterThan(190);
      expect(sunlit, `${seed} at ${home.au} AU`).toBeLessThan(330);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("lights a close pair by both its stars", () => {
    // SystemSpec 2.4.2: every orbit is outside a close pair, so a world in one
    // takes the light of both. Read off the primary alone, the habitable zone is
    // drawn too far in and the main world sits outside the band it belongs in.
    let checked = 0;
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      const { primary, companion, companionOrbit } = system.stars;
      if (companion === null) continue;
      const pair = primary.luminosity + companion.luminosity;
      if (companionOrbit === "close") {
        checked++;
        expect(system.mainWorld.luminosity, seed).toBeCloseTo(pair, 10);
      } else {
        // A far companion is outside every orbit: a bright star in the night
        // rather than a second sun.
        expect(system.mainWorld.luminosity, seed).toBe(primary.luminosity);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("puts a world with water and air in the zone it marks", () => {
    // SystemSpec 5.2.1.2. The mark and the world are both on the diagram, and a
    // world of that description one slot outside the band reads as a mistake
    // whatever the arithmetic behind it was.
    let checked = 0;
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      if (!system.orbits.some((orbit) => orbit.habitable)) continue;
      const profile = parseUwp(system.mainWorld.uwp)!;
      if (profile.hydrographics < 1 || profile.atmosphere < 2 || profile.atmosphere > 9) continue;
      checked++;
      const home = system.orbits.find((o) => o.index === system.mainWorld.orbitIndex)!;
      expect(home.habitable, `${seed} at ${home.au} AU`).toBe(true);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("puts the habitable zone where the light actually is", () => {
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      for (const orbit of system.orbits) {
        // The sunlight-equivalent distance is the true one divided by the reach
        // of what lights it, and the tag follows that and nothing else.
        expect(orbit.sunEquivalentAu, seed).toBeCloseTo(
          orbit.au / Math.sqrt(system.mainWorld.luminosity),
          8,
        );
      }
    }
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
