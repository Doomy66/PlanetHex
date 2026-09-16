/**
 * A sector: sixteen subsectors, and the worlds in all of them. SectorSpec
 * sections 2 and 3.
 *
 * The same arithmetic one level up, and deliberately no new arithmetic at all.
 * A sector's seed fixes its sixteen subsector seeds, each of those fixes eighty
 * hex seeds, and the chain from there down is the one the subsector spec already
 * describes. So a subsector opened out of a sector is the same subsector opened
 * on its own from that seed, which is AppSpec 1.3 at the top of the chain.
 *
 * What the level adds is the things that only exist across a whole sector: a
 * Main that runs past a subsector's edge, a route between two worlds in
 * different subsectors, and a sector file that a map can read whole.
 */

import {
  parseSectorHex,
  subsectorLetter,
  SECTOR_COLS,
  SECTOR_ROWS,
  SUBSECTOR_LETTERS,
} from "../location";
import { seedFrom, type UwpShifts } from "../planet";
import {
  generateSubsector,
  mainsIn,
  routesBetween,
  DEFAULT_DENSITY,
  type ChartWorld,
  type Density,
  type Main,
  type Route,
  type Subsector,
} from "./subsector";

/** The sixteen letters, A to P, in the order the chart lays them out. */
export const SECTOR_SUBSECTORS = SUBSECTOR_LETTERS.split("");

/**
 * The seed of one subsector of a sector. SectorSpec 3.1.
 *
 * Derived from the sector's seed and the letter, so a sector is a seed and
 * nothing else: sixteen charts, each of eighty hexes, all of it reachable from
 * one word. The letter rather than the position, because the letter is what a
 * referee says and what the document stores.
 */
export function subsectorSeedFor(sectorSeed: string, letter: string): string {
  return seedFrom(sectorSeed, letter.toUpperCase());
}

export interface Sector {
  readonly seed: string;
  readonly density: Density;
  readonly shifts: UwpShifts;
  /** The sixteen charts, in letter order. */
  readonly subsectors: readonly Subsector[];
  /** Every world in the sector, in hex order. */
  readonly worlds: readonly ChartWorld[];
  /**
   * The routes across the whole sector. SectorSpec 3.3: a route between two
   * worlds either side of a subsector's edge is a route, and only this level can
   * see it.
   */
  readonly routes: readonly Route[];
  /** The Mains across the whole sector, longest first. SectorSpec 3.4. */
  readonly mains: readonly Main[];
}

/** How many hexes a sector holds, which is what the drawing has to fit. */
export const SECTOR_HEXES = SECTOR_COLS * SECTOR_ROWS;

/**
 * A whole sector. SectorSpec section 3.
 *
 * Sixteen charts generated the way one chart is generated, and then the two
 * things that are only true across all of them worked out again over the lot.
 * The routes and Mains a subsector knows about are its own, and a subsector
 * cannot see past its edge; here there is no edge to see past.
 */
export function generateSector(
  seed: string,
  density: Density = DEFAULT_DENSITY,
  shifts: UwpShifts = {},
): Sector {
  const subsectors = SECTOR_SUBSECTORS.map((letter) =>
    generateSubsector(subsectorSeedFor(seed, letter), letter, density, shifts),
  );
  const worlds = subsectors
    .flatMap((held) => held.worlds)
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    seed,
    density,
    shifts,
    subsectors,
    worlds,
    // Worked out over every world at once. A route that crossed a subsector's
    // edge was invisible to both of the subsectors it joined.
    routes: routesBetween(worlds),
    mains: mainsIn(worlds),
  };
}

/** Which subsector a sector-absolute hex falls in, by its four digits. */
export function letterAt(at: string): string {
  const hex = parseSectorHex(at);
  return hex === null ? "" : subsectorLetter(hex);
}
