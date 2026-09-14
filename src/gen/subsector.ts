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

import { formatSectorHex, subsectorHexes, type SectorHex } from "../location";
import { parseUwp, rollUwp, seedFrom, type Uwp } from "../planet";
import { mainWorldSeed } from "./system";
import { starsFor, starsLabel, systemLuminosity, type Stars } from "./star";
import { formatPbg, pbgFor, tradeCodes, type Pbg, type TradeCode } from "./trade";
import { flavourFor, settlementNames } from "./settle";
import { valueFor } from "./rng";

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

export interface Subsector {
  readonly seed: string;
  readonly letter: string;
  readonly density: Density;
  /** The eighty hexes, in reading order, with the worlds among them. */
  readonly worlds: readonly ChartWorld[];
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

/**
 * The bases a world's port can support. SubSectorSpec 3.5.
 *
 * Derived rather than invented, which is why they are here and the travel zone
 * of 3.6 is more careful: the profile says what quality of port the world has,
 * and the rules say what a port of that quality can carry.
 */
function basesFor(seed: string, profile: Uwp): string {
  const naval =
    (profile.starport === "A" || profile.starport === "B") &&
    valueFor(`${seed}:naval`, 0) < 0.35;
  const scout = "ABCD".includes(profile.starport) && valueFor(`${seed}:scout`, 0) < 0.4;
  if (naval && scout) return "A";
  if (naval) return "N";
  if (scout) return "S";
  return "";
}

/**
 * Whether a world is worth a warning. SubSectorSpec 3.6.
 *
 * Amber is a description of a profile and can be derived. Red is a referee's
 * decision about their own campaign - it says something has gone wrong here that
 * the players should not walk into - and nothing in a profile knows that, so
 * nothing here ever writes one.
 */
function zoneFor(profile: Uwp): string {
  const dangerous = profile.law >= 9 || profile.government === 0 || profile.government === 7;
  return dangerous ? "A" : "";
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
    zone: zoneFor(profile),
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
  return { seed, letter: letter.toUpperCase(), density, worlds };
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
