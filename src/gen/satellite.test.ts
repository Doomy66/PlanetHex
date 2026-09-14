import { describe, expect, it } from "vitest";
import { parseUwp, rollUwp } from "../planet";
import { generateSystem, worldsOf, worldSettings } from "./system";
import { moonSeed, orbitWorldSeed, satelliteUwp } from "./satellite";
import { planetDetail } from "./detail";

const SEEDS = Array.from({ length: 500 }, (_, i) => `system-${i}`);

/** Every world of every system that is not its system's main world. */
const OTHERS = SEEDS.flatMap((seed) => {
  const system = generateSystem(seed);
  return worldsOf(system)
    .filter((world) => !world.main)
    .map((world) => ({ seed, system, world, main: parseUwp(system.mainWorld.uwp)! }));
});

describe("the other worlds", () => {
  it("puts some in most systems and not in every orbit", () => {
    expect(OTHERS.length).toBeGreaterThan(SEEDS.length);
    const bare = SEEDS.map(generateSystem).filter((system) =>
      system.orbits.some((orbit) => orbit.content.kind === "empty"),
    );
    expect(bare.length).toBeGreaterThan(SEEDS.length / 3);
  });

  it("gives every one of them a readable profile and a seed of its own", () => {
    const seeds = new Set<string>();
    for (const { seed, world } of OTHERS) {
      expect(parseUwp(world.uwp), `${seed} orbit ${world.orbitIndex}`).not.toBeNull();
      expect(world.seed).toBe(orbitWorldSeed(seed, world.orbitIndex));
      seeds.add(world.seed);
    }
    // No two worlds share a seed, or they would share a surface.
    expect(seeds.size).toBe(OTHERS.length);
  });

  it("keeps the physical digits its own seed rolled", () => {
    // SystemSpec 6.3: size is the world's own, whatever else its orbit does to
    // it. The surface is built from the seed, and the size digit is what the
    // surface is built at.
    for (const { world } of OTHERS) {
      const rolled = parseUwp(rollUwp(world.seed))!;
      expect(parseUwp(world.uwp)!.size).toBe(rolled.size);
    }
  });

  it("leaves no liquid water out past the ice and no air in close", () => {
    for (const { system, world } of OTHERS) {
      const orbit = system.orbits.find((held) => held.index === world.orbitIndex)!;
      const profile = parseUwp(world.uwp)!;
      if (orbit.sunEquivalentAu > 3) expect(profile.hydrographics).toBe(0);
      if (orbit.sunEquivalentAu < 0.4) expect(profile.atmosphere).toBe(0);
    }
  });

  it("never rolls a second main world", () => {
    // SystemSpec 6.4.1, which is the whole reason the social digits are not
    // rolled: applied to the next orbit out, the main world rules produce a
    // second capital with its own interstellar port and a billion people.
    for (const { seed, world, main } of OTHERS) {
      const profile = parseUwp(world.uwp)!;
      const where = `${seed} orbit ${world.orbitIndex}`;
      expect(profile.population, where).toBeLessThan(Math.max(1, main.population));
      expect(profile.tech, where).toBeLessThanOrEqual(main.tech);
      expect(profile.law, where).toBeLessThanOrEqual(main.law);
      expect("ABX", where).toContain(profile.starport === "X" ? "X" : "");
      expect(["C", "D", "E", "X"], where).toContain(profile.starport);
    }
  });

  it("leaves most of them empty rock", () => {
    // SystemSpec 6.5: a busy system is the exception and should read as one.
    const settled = OTHERS.filter(({ world }) => parseUwp(world.uwp)!.population > 0);
    expect(settled.length / OTHERS.length).toBeLessThan(0.25);
    expect(settled.length).toBeGreaterThan(0);
  });

  it("gives an empty world no government, no law and no port", () => {
    for (const { world } of OTHERS) {
      const profile = parseUwp(world.uwp)!;
      if (profile.population > 0) continue;
      expect(profile.government).toBe(0);
      expect(profile.law).toBe(0);
      expect(profile.tech).toBe(0);
      expect(profile.starport).toBe("X");
    }
  });

  it("settles nothing where nobody lives to settle from", () => {
    for (const { world, main } of OTHERS) {
      if (main.population > 0) continue;
      expect(parseUwp(world.uwp)!.population).toBe(0);
    }
  });

  it("hands each of them a star and an orbit of its own", () => {
    // SystemSpec 6.6.3 and the planet spec 6.15.13.2: what a system writes into
    // a world travels with it, so a world opened from its own save is the world
    // that system made.
    for (const { system, world } of OTHERS.slice(0, 200)) {
      const settings = worldSettings(system, world.orbitIndex);
      expect(settings.orbitAu).toBe(world.au);
      expect(settings.luminosity).toBe(system.mainWorld.luminosity);
      const alone = planetDetail(world.seed, world.uwp, settings);
      expect(alone.orbitAu).toBeCloseTo(world.au, 6);
      expect(Number.isFinite(alone.meanTempK)).toBe(true);
    }
  });

  it("gives every gas giant moons that are worlds of their own", () => {
    // SystemSpec 4.5.1: a moon has its own seed, its own profile and its own
    // surface, so one with people on it opens like anywhere else.
    const seeds = new Set<string>();
    let moons = 0;
    for (const seed of SEEDS) {
      const system = generateSystem(seed);
      for (const orbit of system.orbits) {
        if (orbit.content.kind !== "giant") continue;
        expect(orbit.content.moons.length, seed).toBeGreaterThan(0);
        for (const moon of orbit.content.moons) {
          moons++;
          seeds.add(moon.seed);
          expect(moon.seed).toBe(moonSeed(seed, orbit.index, moon.index));
          const profile = parseUwp(moon.uwp);
          expect(profile, `${seed} moon ${moon.seed}`).not.toBeNull();
          // A moon the size of an Earth would be a world that had been
          // mislabelled. SystemSpec 4.5.2.
          expect(profile!.size, moon.uwp).toBeLessThanOrEqual(5);
        }
      }
    }
    expect(moons).toBeGreaterThan(SEEDS.length);
    expect(seeds.size).toBe(moons);
  });

  it("lets a moon be somewhere people live, and rarely", () => {
    // The user's question, answered by the rules rather than by an exception:
    // a moon is settled on the same terms as any other world of a system.
    let moons = 0;
    let settled = 0;
    for (const seed of SEEDS) {
      for (const orbit of generateSystem(seed).orbits) {
        if (orbit.content.kind !== "giant") continue;
        for (const moon of orbit.content.moons) {
          moons++;
          if (parseUwp(moon.uwp)!.population > 0) settled++;
        }
      }
    }
    expect(settled).toBeGreaterThan(0);
    expect(settled / moons).toBeLessThan(0.2);
  });

  it("gives the same world to the same seed and orbit", () => {
    expect(satelliteUwp("A", 1, parseUwp(rollUwp("main"))!)).toBe(
      satelliteUwp("A", 1, parseUwp(rollUwp("main"))!),
    );
    expect(satelliteUwp("A", 1, parseUwp(rollUwp("main"))!)).not.toBe(
      satelliteUwp("B", 1, parseUwp(rollUwp("main"))!),
    );
  });
});
