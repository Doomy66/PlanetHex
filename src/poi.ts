import {
  latticeKey,
  latticeRef,
  latticeRefPosition,
  parseLattice,
  REFERENCE_SIZE,
  type LatticeRef,
} from "./grid/coord";
import { nearestCell, type CellId, type Grid } from "./grid/grid";

/**
 * Points of interest: the hex attachments of Spec.md 6.5.
 *
 * A POI is user data rather than generated data, so a save carries it explicitly.
 * It is keyed by the lattice name of 2.4.8, which carries the depth it was placed
 * at. That is what lets one sit on a hex of the local panel, which is finer than
 * anything the reference lattice of 2.4 has a name for.
 *
 * The name does not depend on the level being viewed, so moving the slider
 * neither moves a POI nor loses one. Every panel draws it on whichever of its own
 * hexes covers it, which is the nearest centre under 6.6.1.1.
 */

/** What a POI is. Spec 6.5.2: a place on the world, or a note about one. */
export type PoiKind = "starport" | "comment";

export const POI_KINDS: readonly PoiKind[] = ["starport", "comment"];

export interface Poi {
  readonly kind: PoiKind;
  /** What the place is called. Free text, and the label a tooltip leads with. */
  readonly name: string;
  /** Free prose about it, as the planet's own narrative is under 6.10. */
  readonly narrative: string;
  /** The point it sits on, named on the lattice it was placed on. Spec 6.6. */
  readonly ref: LatticeRef;
}

/** A POI and the cell of the grid in hand it is drawn on. Spec 6.6. */
export interface PoiPlacement {
  readonly poi: Poi;
  readonly cell: CellId;
}

/**
 * Where each POI lands on a grid. Spec 6.6.1: whichever hex of that grid covers
 * the point, which for a hex lattice is the hex whose centre it is nearest. A
 * grid that has the point itself finds that hex, since a point is nearest its own
 * centre, so the exact case needs no rule of its own.
 *
 * Works for any grid, which is what lets the display grid and the far finer
 * lattice of the local panel place the same POI by the same rule.
 */
export function poiPlacements(grid: Grid, pois: readonly Poi[]): PoiPlacement[] {
  const out: PoiPlacement[] = [];
  for (const poi of pois) {
    const cell = nearestCell(grid, latticeRefPosition(poi.ref));
    if (cell !== null) out.push({ poi, cell });
  }
  return out;
}

/** Where a POI sits on the sphere. */
export const poiPosition = latticeRefPosition;

/** One POI to a point, so a coordinate is enough to find, replace, or drop one. */
export function poiAt(pois: readonly Poi[], ref: LatticeRef | null): Poi | null {
  if (ref === null) return null;
  const key = latticeKey(ref);
  return pois.find((poi) => latticeKey(poi.ref) === key) ?? null;
}

/**
 * The list with `poi` on its point, replacing whatever was there. A new list
 * rather than a mutation, so a caller holding the old one is holding what it had.
 */
export function putPoi(pois: readonly Poi[], poi: Poi): Poi[] {
  const key = latticeKey(poi.ref);
  const kept = pois.filter((existing) => latticeKey(existing.ref) !== key);
  return [...kept, poi];
}

export function removePoi(pois: readonly Poi[], ref: LatticeRef): Poi[] {
  const key = latticeKey(ref);
  return pois.filter((poi) => latticeKey(poi.ref) !== key);
}

/** What the starport a profile gives a world is called. Spec 6.5.8. */
export function starportName(letter: string): string {
  return `Starport ${letter}`;
}

/** The starports on a world, in the order they were placed. */
export function starports(pois: readonly Poi[]): Poi[] {
  return pois.filter((poi) => poi.kind === "starport");
}

/**
 * What a reroll did to the world's starport. Spec 6.5.8.5.
 *
 * `moved` and `removed` are the two that changed something. `several` is a world
 * carrying more than one, which the reroll will not choose between under
 * 6.5.8.5.3, and `none` covers the rest: a world with no starport to move, a
 * profile that cannot be read, and a surface with nowhere to put one.
 */
export type StarportRerollOutcome = "moved" | "removed" | "several" | "none";

export interface StarportReroll {
  /** The list to keep, new in every case, as putPoi and removePoi are. */
  readonly pois: Poi[];
  readonly outcome: StarportRerollOutcome;
}

/**
 * The world's starport after a new profile has been rolled. Spec 6.5.8.5.
 *
 * A reroll is a different kind of world on the same seed, so the class the port
 * is and the ground it stands on have both changed and the site the terrain
 * picked was picked for a world that is gone. The narrative comes across
 * untouched under 6.5.8.5.1: what the user wrote is theirs, and only where the
 * port is and what it is called belong to the profile.
 *
 * `letter` is the starport digit of the new profile, or null where the profile
 * cannot be read. `ref` is where the terrain now puts a port, or null where it
 * has nowhere to put one.
 */
export function rerollStarport(
  pois: readonly Poi[],
  letter: string | null,
  ref: LatticeRef | null,
): StarportReroll {
  const ports = starports(pois);
  // A world the user has emptied stays empty, and one carrying several is an
  // arrangement the profile does not get to pick from. Spec 6.5.8.5.3 and .5.
  if (ports.length === 0) return { pois: [...pois], outcome: "none" };
  if (ports.length > 1) return { pois: [...pois], outcome: "several" };
  const port = ports[0]!;
  // An unreadable profile says nothing either way. Spec 6.5.8.5.4.
  if (letter === null) return { pois: [...pois], outcome: "none" };
  // X says the world has no starport, and 6.5.8.3 declines to place one there,
  // so one already standing goes.
  if (letter === "X") return { pois: removePoi(pois, port.ref), outcome: "removed" };
  if (ref === null) return { pois: [...pois], outcome: "none" };
  const moved: Poi = { ...port, name: starportName(letter), ref };
  return { pois: putPoi(removePoi(pois, port.ref), moved), outcome: "moved" };
}

/**
 * The POIs of a loaded save. Unlike the seed of 6.4.3 a POI is not something the
 * planet cannot be rebuilt without, so an entry that cannot be read is dropped
 * rather than refusing the file: losing one note beats refusing the world it was
 * written about.
 */
export function parsePois(raw: unknown): Poi[] {
  if (!Array.isArray(raw)) return [];
  const out: Poi[] = [];
  for (const entry of raw) {
    const poi = readPoi(entry);
    if (poi !== null) out.push(poi);
  }
  return out;
}

function readPoi(raw: unknown): Poi | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const kind = POI_KINDS.includes(r["kind"] as PoiKind) ? (r["kind"] as PoiKind) : null;
  const ref = readRef(r["ref"]);
  if (kind === null || ref === null) return null;
  return {
    kind,
    name: typeof r["name"] === "string" ? r["name"] : "",
    narrative: typeof r["narrative"] === "string" ? r["narrative"] : "",
    ref,
  };
}

/**
 * A coordinate as the numbers or as the written form of 2.4.8. A save written
 * before POIs could sit on the fine lattice carries no depth, and every one of
 * those was a display hex, so the reference lattice is what it means.
 */
function readRef(raw: unknown): LatticeRef | null {
  if (typeof raw === "string") return parseLattice(raw);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const whole = (key: string) =>
    typeof r[key] === "number" && Number.isInteger(r[key]) && (r[key] as number) >= 0
      ? (r[key] as number)
      : null;
  const face = whole("face");
  const i = whole("i");
  const j = whole("j");
  const size = whole("size") ?? REFERENCE_SIZE;
  if (face === null || i === null || j === null) return null;
  if (face > 19 || j > i || i > size || size < 1) return null;
  // Canonical, so what a save holds and what a click makes are the same name.
  return latticeRef(face, i, j, size);
}
