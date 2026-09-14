/**
 * What a system carries besides its profile: its bases and its travel zone.
 * SubSectorSpec 3.5 and 3.6, SystemSpec 4.7.
 *
 * A base is a fact about the system rather than about the chart that draws it,
 * so it lives here where both levels can read it. The chart puts it in the Bases
 * column and draws a mark for it; the system says which orbit it is in, because
 * a naval base is a station in orbit of the main world and a scout way station
 * is a field on it or a tender beside it, and a referee arriving in a system
 * wants to know which rock the navy is parked over.
 *
 * Derived rather than invented, from the main world's own seed, so the chart and
 * the system agree without either of them telling the other: the profile says
 * what quality of port the world has, and the rules say what a port of that
 * quality can carry.
 */

import type { Uwp } from "../planet";
import { valueFor } from "./rng";

/** How often a port good enough for one has a naval base, and a scout one. */
const NAVAL = 0.35;
const SCOUT = 0.4;

/**
 * The Bases column: "A" for both, "N" for naval, "S" for scout, "" for neither.
 * SubSectorSpec 3.5.1 - naval at A and B, scout at A through D.
 */
export function basesFor(seed: string, profile: Uwp): string {
  const naval =
    (profile.starport === "A" || profile.starport === "B") && valueFor(`${seed}:naval`, 0) < NAVAL;
  const scout = "ABCD".includes(profile.starport) && valueFor(`${seed}:scout`, 0) < SCOUT;
  if (naval && scout) return "A";
  if (naval) return "N";
  if (scout) return "S";
  return "";
}

export function hasNaval(bases: string): boolean {
  return bases === "N" || bases === "A";
}

export function hasScout(bases: string): boolean {
  return bases === "S" || bases === "A";
}

/** What the column letter says, in words. */
export function basesLabel(bases: string): string {
  if (bases === "A") return "naval and scout";
  if (bases === "N") return "naval";
  if (bases === "S") return "scout";
  return "none";
}

/**
 * Whether a world is worth a warning. SubSectorSpec 3.6.
 *
 * Amber is a description of a profile and can be derived. Red is a referee's
 * decision about their own campaign - it says something has gone wrong here that
 * the players should not walk into - and nothing in a profile knows that, so
 * nothing here ever writes one.
 */
export function zoneFor(profile: Uwp): string {
  const dangerous = profile.law >= 9 || profile.government === 0 || profile.government === 7;
  return dangerous ? "A" : "";
}

/** What the zone letter says, in words. */
export function zoneLabel(zone: string): string {
  if (zone === "A") return "amber";
  if (zone === "R") return "red";
  return "green";
}
