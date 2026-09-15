/**
 * A subsector: eighty hexes, each of them empty space or a star system.
 * SubSectorSpec sections 2 and 3.
 *
 * What the chart holds for a hex is what a chart holds: the main world's
 * profile, its name, its trade classifications, its bases, its travel zone, its
 * PBG figures and its stars. Not a system - SystemSpec 11.4 has a hex generated
 * in full only when it is opened, and a chart that laid out eighty systems of
 * orbits it will never draw would be doing seventy-nine of them for nothing.
 *
 * Everything here descends from the subsector's seed, and the chain runs
 * subsector to system to world: a hex names a system seed, the system names its
 * main world's, and that seed is an ordinary planet's. So a world found on this
 * chart is the same world opened on its own, which is AppSpec 1.3.
 */

import { formatSectorHex, hexDistance, subsectorHexes, type SectorHex } from "../location";
import { parseUwp, rollUwp, seedFrom, type Uwp } from "../planet";
import { mainWorldSeed } from "./system";
import { starsFor, starsLabel, systemLuminosity, type Stars } from "./star";
import { formatPbg, pbgFor, tradeCodes, type Pbg, type TradeCode } from "./trade";
import { flavourFor, settlementNames } from "./settle";
import { valueFor } from "./rng";
import { basesFor, zoneFor } from "./base";

/**
 * How thickly the stars lie. SubSectorSpec 3.2.2.
 *
 * Standard is the one in two that Traveller's own charts are built to; the
 * others are the rift and the cluster either side of it.
 */
export const DENSITIES = {
  rift: 1 / 6,
  sparse: 1 / 3,
  standard: 1 / 2,
  dense: 2 / 3,
} as const;

export type Density = keyof typeof DENSITIES;
export const DEFAULT_DENSITY: Density = "standard";

/** How often a world takes the subsector's own way of naming things. 3.4.2. */
const FOLLOWS_THE_REGION = 0.75;

/**
 * A world on the chart. Everything a sector line carries and everything the
 * chart draws, and nothing that would need a system laid out to know.
 */
export interface ChartWorld {
  readonly hex: SectorHex;
  /** The four digits, sector-absolute. SubSectorSpec 2.2.2. */
  readonly at: string;
  readonly name: string;
  /** The seed of the system, from which everything below it descends. */
  readonly systemSeed: string;
  /** The seed of the world itself, which is an ordinary planet's. */
  readonly seed: string;
  readonly uwp: string;
  readonly profile: Uwp;
  readonly trade: readonly TradeCode[];
  readonly pbg: Pbg;
  readonly stars: Stars;
  /** Naval, scout, both or neither, as the Bases column writes them. 3.5. */
  readonly bases: string;
  /** "A" for amber, "R" for red where a referee has said so, else "". 3.6. */
  readonly zone: string;
}

/**
 * A lane between two worlds. SubSectorSpec 3.9.
 *
 * Main where both ends have a port good enough to build a scheduled run around,
 * and a feeder otherwise: the difference is worth drawing, because it is the
 * difference between a route somebody keeps to a timetable and a route somebody
 * flies when there is a reason to.
 */
export interface Route {
  readonly from: string;
  readonly to: string;
  readonly main: boolean;
}

export interface Subsector {
  readonly seed: string;
  readonly letter: string;
  readonly density: Density;
  /** The eighty hexes, in reading order, with the worlds among them. */
  readonly worlds: readonly ChartWorld[];
  /** The lanes between them, each pair once. 3.9. */
  readonly routes: readonly Route[];
}

/**
 * How far a world's own traffic reaches, in jumps. SubSectorSpec 3.9.2.
 *
 * A port is what a lane is flown to, so the port decides how far the lane comes
 * from: a yard that can refine fuel and refit a ship is worth crossing two hexes
 * for, anywhere else is worth crossing one, and a world with no port at all is
 * on nobody's schedule.
 *
 * 3.9.2.1 The numbers are small on purpose. A lane between every pair of worlds
 * that could reach each other is a chart with a hundred lines on it, which is a
 * chart that says nothing. Roughly one lane per world leaves a web a referee can
 * follow from one end of a subsector to the other.
 */
function reachOf(profile: Uwp): number {
  if (profile.starport === "A" || profile.starport === "B") return 2;
  if ("CDE".includes(profile.starport)) return 1;
  return 0;
}

/**
 * The lanes. SubSectorSpec 3.9.
 *
 * Both ends have to be worth the trip and close enough for the poorer of the
 * two to be reached at all, which is what makes the web thin out around bad
 * ports and thicken between good ones without anything being rolled for. A red
 * zone is off the lanes entirely: an interdiction is exactly the thing a
 * scheduled run is not flown through.
 */
export function routesBetween(worlds: readonly ChartWorld[]): Route[] {
  const open = worlds.filter((world) => world.profile.population > 0 && world.zone !== "R");
  const routes: Route[] = [];
  for (const [at, from] of open.entries()) {
    for (const to of open.slice(at + 1)) {
      const reach = Math.min(reachOf(from.profile), reachOf(to.profile));
      if (reach === 0 || hexDistance(from.hex, to.hex) > reach) continue;
      const main = "AB".includes(from.profile.starport) && "AB".includes(to.profile.starport);
      routes.push({ from: from.at, to: to.at, main });
    }
  }
  return routes;
}

/** The seed of the system in a hex. SubSectorSpec 3.1.3. */
export function systemSeedFor(subsectorSeed: string, at: string): string {
  return seedFrom(subsectorSeed, at);
}

/**
 * Whether a hex holds a system. SubSectorSpec 3.2.1.
 *
 * A fixed value per hex against a threshold, rather than a roll per density, so
 * that raising the density only ever adds systems and never moves the ones
 * already there. 3.2.2.1: the referee who has written notes on half a chart and
 * then decides the region should be busier keeps the half they wrote.
 */
export function holdsSystem(seed: string, at: string, density: Density): boolean {
  return presenceOf(seed, at) < DENSITIES[density];
}

function presenceOf(seed: string, at: string): number {
  return valueFor(`${seed}:presence`, Number(at));
}

/** The world in one hex, or null where the hex is empty space. */
export function chartWorld(
  seed: string,
  at: string,
  hex: SectorHex,
  density: Density,
  regional = flavourFor(`${seed}:flavour`),
): ChartWorld | null {
  if (!holdsSystem(seed, at, density)) return null;
  const systemSeed = systemSeedFor(seed, at);
  const worldSeed = mainWorldSeed(systemSeed);
  const uwp = rollUwp(worldSeed);
  const profile = parseUwp(uwp);
  if (profile === null) return null;
  // Most worlds are named the way the region names things, and the rest are
  // wherever somebody from somewhere else settled. SubSectorSpec 3.4.2.1.
  const follows = valueFor(`${seed}:flavour-follows`, Number(at)) < FOLLOWS_THE_REGION;
  const flavour = follows ? regional : flavourFor(`${systemSeed}:names`);
  return {
    hex,
    at,
    name: settlementNames(`${systemSeed}:names`, 1, flavour)[0] ?? systemSeed,
    systemSeed,
    seed: worldSeed,
    uwp,
    profile,
    trade: tradeCodes(uwp),
    pbg: pbgFor(worldSeed, uwp),
    stars: starsFor(systemSeed),
    bases: basesFor(worldSeed, profile),
    zone: zoneFor(worldSeed, profile),
  };
}

/** The whole chart. SubSectorSpec 3. */
export function generateSubsector(
  seed: string,
  letter: string,
  density: Density = DEFAULT_DENSITY,
): Subsector {
  const regional = flavourFor(`${seed}:flavour`);
  const worlds: ChartWorld[] = [];
  for (const hex of subsectorHexes(letter)) {
    const at = formatSectorHex(hex);
    const world = chartWorld(seed, at, hex, density, regional);
    if (world !== null) worlds.push(world);
  }
  return {
    seed,
    letter: letter.toUpperCase(),
    density,
    worlds,
    routes: routesBetween(worlds),
  };
}

/** What lights a world's orbits, which is both stars of a close pair. 2.4.2. */
export function luminosityOfWorld(world: ChartWorld): number {
  return systemLuminosity(world.stars);
}

/** The Stars column of a sector line. SystemSpec 1.6.4. */
export function starsOf(world: ChartWorld): string {
  return starsLabel(world.stars);
}

/** The PBG column. SubSectorSpec 3.3.3. */
export function pbgOf(world: ChartWorld): string {
  return formatPbg(world.pbg);
}
