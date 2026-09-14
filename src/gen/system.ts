/**
 * A star system: the stars, the orbits around them, and what sits in those
 * orbits. SystemSpec sections 3 to 5.
 *
 * The direction everything here runs in is SystemSpec 1.6. The main world's
 * profile is read and never written: it is `rollUwp` of its own seed, which is
 * what the chart above already drew and what a user clicking a hex has to find.
 * The star and its orbits are rolled in their own right, and the world is then
 * placed in the best orbit they turn out to offer and told where it ended up.
 *
 * The other worlds of SystemSpec section 6 are satellite.ts, which is where the
 * seam of 6.6 is: their physical digits are their own seed's and their social
 * digits are the main world's.
 */

import { parseUwp, rollUwp, seedFrom, type Uwp } from "../planet";
import { holdsWorld, moonSeed, moonUwp, orbitWorldSeed, satelliteUwp } from "./satellite";
import { pbgFor, type Pbg } from "./trade";
import { planetDetail } from "./detail";
import { valueFor } from "./rng";
import { starsFor, systemLuminosity, type Stars } from "./star";

/**
 * The orbits, in AU. The solar system's own spacing, which is the pattern
 * climate.ts already describes: each orbit out is a multiple of the last rather
 * than a step further, so the inner ones are crowded and the outer ones are not.
 */
const ORBIT_AU = [0.2, 0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10, 20, 30, 40, 52] as const;

/**
 * The innermost orbit a star leaves alone, as a multiple of the square root of
 * its luminosity. A big hot star sweeps and scatters what forms close in, which
 * is SystemSpec 3.1, and the square root is there because everything in this
 * file that converts a star's output to a distance uses it: twice as far for
 * four times the light.
 */
const SWEPT_INSIDE = 0.05;

/**
 * The outermost orbit worth drawing, on the same scaling. Past it a world gets
 * so little light that it is a frozen rock whatever its profile says, and
 * SystemSpec 3.1 has a small star with few orbits far enough out to matter.
 */
const REACHES_TO = 40;

/**
 * The sunlight-equivalent band a world can hold liquid water in.
 *
 * Wider than a bare rock's freezing point either side, because a world's own air
 * moves it: a thick atmosphere keeps water liquid further out and a bright cloudy
 * one stays cool further in. The band is what the star offers, and section 5 is
 * where a particular world's own reading of it is taken.
 */
const HABITABLE_BAND = { near: 0.75, far: 1.5 } as const;

/**
 * What makes a world one that wants the habitable zone: water to keep liquid,
 * and air worth the name to keep it under. SystemSpec 5.2.
 */
function wantsTheZone(profile: Uwp | null): boolean {
  if (profile === null) return false;
  return profile.hydrographics >= 1 && profile.atmosphere >= 2 && profile.atmosphere <= 9;
}

/**
 * Where ices survive planet formation, in sunlight-equivalent AU. Gas giants
 * form outside it and not inside it, which is why the solar system's are where
 * they are.
 */
const SNOW_LINE = 2.7;

/**
 * A moon of a gas giant. SystemSpec 4.5.1: a world like any other, with its own
 * seed and its own surface, so one with people on it opens like anywhere else.
 */
export interface Moon {
  /** Its place in the giant's own family, from 1 outwards. */
  readonly index: number;
  readonly seed: string;
  readonly uwp: string;
}

export type OrbitContent =
  | { readonly kind: "empty" }
  | { readonly kind: "belt" }
  | { readonly kind: "giant"; readonly moons: readonly Moon[] }
  | { readonly kind: "world"; readonly main: boolean; readonly seed: string; readonly uwp: string };

export interface Orbit {
  /** Its number, counting outward from the primary and starting at zero. */
  readonly index: number;
  /** Where it is, in AU. */
  readonly au: number;
/**
   * The distance from the Sun that would give a world in this orbit the same
   * light. Not what a world takes away with it - that is the true distance in
   * `au`, with the star's output beside it - but what the habitable zone and the
   * snow line are worked out on, since both are questions about light.
   */
  readonly sunEquivalentAu: number;
  /** Whether liquid water is possible here. */
  readonly habitable: boolean;
  readonly content: OrbitContent;
}

export interface MainWorld {
  readonly seed: string;
  readonly uwp: string;
  /** Which orbit it ended up in, which is an index into the system's orbits. */
  readonly orbitIndex: number;
  /** Where it is, in AU, and what goes into its orbit setting. SystemSpec 5.2.2. */
  readonly au: number;
  /**
   * The output of what it orbits, which goes into its luminosity setting: both
   * stars of a close pair, or the primary alone. Without it the orbit above
   * means nothing, since the same distance is a furnace around one star and a
   * cinder around another.
   */
  readonly luminosity: number;
}

export interface StarSystem {
  readonly seed: string;
  readonly stars: Stars;
  readonly orbits: readonly Orbit[];
  readonly mainWorld: MainWorld;
  /** Population multiplier, belts and gas giants, read rather than rolled. */
  readonly pbg: Pbg;
  /**
   * How many of those belts and gas giants the orbits had room for.
   *
   * The same as the figures above in all but the extreme systems. A star whose
   * orbits have been swept away, or which reaches nowhere, can have fewer orbits
   * than the chart's counts ask for, and there is nowhere to put the rest: the
   * counts were drawn from a seed under the planet spec 6.16.2 without anything
   * knowing what star they would have to fit around. Placing what fits and
   * saying so beats stacking two gas giants in one orbit.
   */
  readonly placed: { readonly belts: number; readonly gasGiants: number };
}

/** The seed of a system's main world. SystemSpec 5.1. */
export function mainWorldSeed(systemSeed: string): string {
  return seedFrom(systemSeed, "world");
}

/**
 * The orbits a star has, before anything is put in them. SystemSpec 3.
 *
 * Both ends scale with the square root of the star's output, so a dim star has a
 * short crowded run of orbits and a bright one has its inner orbits swept away.
 */
export function orbitsFor(luminosity: number): readonly { index: number; au: number; sunEquivalentAu: number; habitable: boolean }[] {
  const reach = Math.sqrt(luminosity);
  return ORBIT_AU.map((au, index) => ({ au, index }))
    .filter(({ au }) => au >= SWEPT_INSIDE * reach && au <= REACHES_TO * reach)
    .map(({ au, index }) => {
      const sunEquivalentAu = au / reach;
      return {
        index,
        au,
        sunEquivalentAu,
        habitable: sunEquivalentAu >= HABITABLE_BAND.near && sunEquivalentAu <= HABITABLE_BAND.far,
      };
    });
}

/**
 * The orbit the profile points to, around this star. SystemSpec 5.2.1.
 *
 * The planet spec 6.15 already derives an orbital distance from a profile and a
 * star, and this asks it rather than working out a second opinion about where a
 * world of that description belongs. One derivation, read in two places.
 */
function wantedAu(seed: string, uwp: string, luminosity: number): number {
  return planetDetail(seed, uwp, { luminosity }).orbitAu;
}

/** The orbit nearest a wanted distance, measured the way orbits are spaced. */
function nearestOrbit<T extends { au: number }>(orbits: readonly T[], wanted: number): T {
  let best = orbits[0]!;
  let bestGap = Infinity;
  for (const orbit of orbits) {
    // Compared as a ratio rather than a difference: the gap from 0.7 to 1.0 is
    // the same step as the gap from 20 to 30, and a difference would put every
    // world in the outermost orbit it could reach.
    const gap = Math.abs(Math.log(orbit.au / wanted));
    if (gap < bestGap) {
      best = orbit;
      bestGap = gap;
    }
  }
  return best;
}

/** An ordering of indexes fixed by the seed, so a choice among several is stable. */
function shuffled(seed: string, stream: string, of: readonly number[]): number[] {
  return [...of]
    .map((value, index) => ({ value, at: valueFor(`${seed}:system:${stream}`, index) }))
    .sort((a, b) => a.at - b.at)
    .map(({ value }) => value);
}

/**
 * A whole system from its seed.
 *
 * The order is SystemSpec 3.3: roll the star, lay out its orbits, find the
 * habitable zone, then fill the orbits. The main world goes in first because
 * section 5 decides where it belongs and section 4 works around it.
 */
export function generateSystem(seed: string): StarSystem {
  const stars = starsFor(seed);
  // What the orbits are lit by, which is both stars where the companion is
  // inside them all and the primary alone where it is outside them all.
  const luminosity = systemLuminosity(stars);
  const laid = orbitsFor(luminosity);
  const worldSeed = mainWorldSeed(seed);
  const uwp = rollUwp(worldSeed);
  const pbg = pbgFor(worldSeed, uwp);

  // A world with water and breathable air goes in the habitable zone where the
  // star has one, and takes the orbit nearest what its profile asks for within
  // it. SystemSpec 5.2: the zone is drawn on the diagram, and a world of that
  // description sitting one slot outside the band reads as a mistake whatever
  // the arithmetic behind it was.
  const wanted = wantedAu(worldSeed, uwp, luminosity);
  const zone = laid.filter((orbit) => orbit.habitable);
  const home =
    wantsTheZone(parseUwp(uwp)) && zone.length > 0
      ? nearestOrbit(zone, wanted)
      : nearestOrbit(laid, wanted);
  const content = new Map<number, OrbitContent>();
  content.set(home.index, { kind: "world", main: true, seed: worldSeed, uwp });

  // The counts are the chart's, under SystemSpec 1.6.3, and this level places
  // exactly that many rather than rolling its own opinion of how many there are.
  const free = laid.filter((orbit) => orbit.index !== home.index);
  const outer = free.filter((orbit) => orbit.sunEquivalentAu >= SNOW_LINE).map((o) => o.index);
  const inner = free.filter((orbit) => orbit.sunEquivalentAu < SNOW_LINE).map((o) => o.index);

  // Gas giants form outside the snow line, so they take the outer orbits and
  // fall back on the inner ones only where a small star has none to give.
  const homeProfileForMoons = parseUwp(uwp);
  for (const index of [...shuffled(seed, "giants", outer), ...shuffled(seed, "giants-in", inner)]) {
    if (countOf(content, "giant") >= pbg.gasGiants) break;
    const at = laid.find((orbit) => orbit.index === index)!;
    content.set(index, {
      kind: "giant",
      moons: moonsFor(seed, index, at.sunEquivalentAu, homeProfileForMoons),
    });
  }
  // A belt is where a world would have formed and did not, which is any orbit
  // still empty. SystemSpec 4.2.
  for (const index of shuffled(seed, "belts", [...inner, ...outer])) {
    if (countOf(content, "belt") >= pbg.belts) break;
    if (content.has(index)) continue;
    content.set(index, { kind: "belt" });
  }

  // Everything still empty may hold a world of its own. SystemSpec 4.4 and 6.1:
  // the orbits the chart's figures did not claim are where the rest of a system
  // is, and most of what is there is rock nobody has been to.
  const homeProfile = parseUwp(uwp);
  for (const orbit of laid) {
    if (content.has(orbit.index)) continue;
    if (!holdsWorld(seed, orbit.index)) continue;
    const worldSeed = orbitWorldSeed(seed, orbit.index);
    content.set(orbit.index, {
      kind: "world",
      main: false,
      seed: worldSeed,
      uwp: satelliteUwp(worldSeed, orbit.sunEquivalentAu, homeProfile),
    });
  }

  const orbits = laid.map((orbit) => ({
    ...orbit,
    content: content.get(orbit.index) ?? { kind: "empty" as const },
  }));

  return {
    seed,
    stars,
    orbits,
    pbg,
    placed: { belts: countOf(content, "belt"), gasGiants: countOf(content, "giant") },
    mainWorld: {
      seed: worldSeed,
      uwp,
      orbitIndex: home.index,
      au: home.au,
      luminosity,
    },
  };
}

/**
 * What a system writes into a world it hands over. SystemSpec 1.6.2 and 5.2.2.
 *
 * These are the nullable settings of the planet spec 6.15, where null means the
 * rolled value stands and a value means somebody has overruled it. They travel
 * with the world in its own save, so a world lifted out of its system and opened
 * on its own is still the world that system made. SystemSpec 6.6.3.
 */
export function worldSettings(
  system: StarSystem,
  orbitIndex: number = system.mainWorld.orbitIndex,
): { orbitAu: number; luminosity: number } {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  return {
    orbitAu: orbit?.au ?? system.mainWorld.au,
    luminosity: system.mainWorld.luminosity,
  };
}

/**
 * Every world in a system, the main one first. SystemSpec 6.2: each is a planet
 * of the planet spec, with its own seed and its own surface, and each opens the
 * same way.
 */
export function worldsOf(system: StarSystem): readonly {
  orbitIndex: number;
  au: number;
  main: boolean;
  seed: string;
  uwp: string;
}[] {
  return system.orbits
    .filter((orbit) => orbit.content.kind === "world")
    .map((orbit) => {
      const held = orbit.content as { main: boolean; seed: string; uwp: string };
      return { orbitIndex: orbit.index, au: orbit.au, ...held };
    })
    .sort((a, b) => Number(b.main) - Number(a.main) || a.orbitIndex - b.orbitIndex);
}

/** The moons of the gas giant in an orbit, or none where there is no giant. */
export function moonsOf(system: StarSystem, orbitIndex: number): readonly Moon[] {
  const orbit = system.orbits.find((held) => held.index === orbitIndex);
  return orbit !== undefined && orbit.content.kind === "giant" ? orbit.content.moons : [];
}

/**
 * Which planet or which belt an orbit holds, counting outward from one.
 * SystemSpec 7.2.
 *
 * Counted rather than taken from the orbit's own number, because the orbits are
 * slots in a table that starts closer in than most systems have anything, and a
 * reader counts planets. The third planet of Sol is Earth whether or not there
 * is a slot inside Mercury's.
 *
 * Planets and belts are counted apart, so a belt between two planets does not
 * push the numbering of everything beyond it along.
 */
export function ordinalOf(
  system: StarSystem,
  orbitIndex: number,
): { kind: "planet" | "belt" | "none"; n: number } {
  let planets = 0;
  let belts = 0;
  for (const orbit of system.orbits) {
    const kind = orbit.content.kind;
    if (kind === "world" || kind === "giant") planets++;
    else if (kind === "belt") belts++;
    if (orbit.index !== orbitIndex) continue;
    if (kind === "world" || kind === "giant") return { kind: "planet", n: planets };
    if (kind === "belt") return { kind: "belt", n: belts };
    return { kind: "none", n: 0 };
  }
  return { kind: "none", n: 0 };
}

/**
 * What a planet of a system is called, before anybody names it. SystemSpec 7.2:
 * the system's name, a hyphen, and which planet it is, which is also the stem
 * every file of that world is saved under at the app spec 4.2.1.
 */
export function worldName(systemName: string, planet: number): string {
  return `${systemName}-${planet}`;
}

/** What a belt is called. Belts are counted apart from planets. SystemSpec 7.4. */
export function beltName(systemName: string, belt: number): string {
  return `${systemName} Belt-${belt}`;
}

function countOf(content: Map<number, OrbitContent>, kind: OrbitContent["kind"]): number {
  let count = 0;
  for (const held of content.values()) if (held.kind === kind) count++;
  return count;
}

/**
 * The moons of the gas giant in one orbit. SystemSpec 4.5.
 *
 * Each is a world of its own rather than a tally, because a gas giant's moon is
 * one of the places people live: it has the gravity, it has the ices, and it is
 * a fuel stop with a view of the primary. 4.5.1.
 */
function moonsFor(
  seed: string,
  index: number,
  sunEquivalentAu: number,
  main: Uwp | null,
): readonly Moon[] {
  const count = Math.floor(valueFor(`${seed}:system:moons`, index) * 12) + 1;
  return Array.from({ length: count }, (_, at) => {
    const moon = at + 1;
    const held = moonSeed(seed, index, moon);
    return { index: moon, seed: held, uwp: moonUwp(held, sunEquivalentAu, main) };
  });
}
