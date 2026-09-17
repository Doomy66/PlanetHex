/**
 * A whole subsector as a sector file. SubSectorSpec 6.1.
 *
 * This is the export the level exists to make possible. A referee who has drawn
 * eighty worlds wants them on a sector map beside everybody else's, and every
 * tool that draws sector maps reads these columns.
 *
 * One line per system, in hex order, under the header the format is identified
 * by. The three columns a single planet had to leave blank - bases, zone and
 * stars - are filled from what the subsector knows.
 */

import { newPlanet, type Planet } from "../../planet";
import { starsOf, pbgOf, type SubsectorWorld, type Subsector } from "../../gen/subsector";
import type { Sector } from "../../gen/sector";
import { sectorHeader, worldLine } from "./sec";

/** The planet a subsector world stands for, which is what the line is written from. */
function planetOf(world: SubsectorWorld): Planet {
  return {
    ...newPlanet(world.seed),
    name: world.name,
    hex: world.at,
    uwp: world.uwp,
  };
}

/** The subsector as a sector file. */
export function subsectorFile(subsector: Subsector, sector = ""): string {
  const lines = subsector.worlds.map((world) =>
    worldLine(planetOf(world), {
      name: world.name,
      bases: world.bases,
      zone: world.zone,
      stars: starsOf(world),
      pbg: pbgOf(world),
    }),
  );
  return `${subsectorNotes(subsector, sector)}${sectorHeader()}${lines.join("")}`;
}

/**
 * A whole sector as a sector file. SectorSpec 6.1.
 *
 * The export the sector level exists to make possible, and the one every tool
 * that draws sector maps is waiting for: 1,280 hexes under one header, in hex
 * order, rather than sixteen files to be stitched together by hand.
 */
export function sectorFile(sector: Sector, name = ""): string {
  const inhabited = sector.worlds.filter((world) => world.profile.population > 0).length;
  const notes = [
    `# ${name === "" ? "Sector" : name}, exported from PlanetHex`,
    `# Seed: ${sector.seed}`,
    `# Density: ${sector.density}`,
    `# ${sector.worlds.length} systems across sixteen subsectors, ${inhabited} of them inhabited`,
    "# Allegiance is Na throughout: nothing here has claimed anything.",
    "",
  ].join("\n");
  const lines = sector.worlds.map((world) =>
    worldLine(planetOf(world), {
      name: world.name,
      bases: world.bases,
      zone: world.zone,
      stars: starsOf(world),
      pbg: pbgOf(world),
    }),
  );
  return `${notes}${sectorHeader()}${lines.join("")}`;
}

/**
 * The header comment a sector file usually carries, so the lines under it can be
 * read by somebody who did not export them. SubSectorSpec 6.1 and the planet
 * spec 6.18's own notes.
 */
export function subsectorNotes(subsector: Subsector, sector = ""): string {
  const inhabited = subsector.worlds.filter((world) => world.profile.population > 0).length;
  return [
    `# Subsector ${subsector.letter}${sector === "" ? "" : ` of ${sector}`}, exported from PlanetHex`,
    `# Seed: ${subsector.seed}`,
    `# Density: ${subsector.density}`,
    `# ${subsector.worlds.length} systems, ${inhabited} of them inhabited`,
    "# Allegiance is Na throughout: nothing here has claimed anything.",
    "",
  ].join("\n");
}
