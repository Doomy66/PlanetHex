import { formatRef, type RefIndex } from "../../grid/coord";
import { buildRefIndex } from "../../grid/coord";
import { isIced } from "../../gen/ice";
import { terrainBand } from "../../ui/colour";
import { heightColour } from "../../ui/colour";
import { poiPlacements, type Poi } from "../../poi";
import type { Surface } from "../../surface";
import type { Vec3 } from "../../grid/vec3";

/**
 * Every hex of a grid as a record a table or a map file can hold. Spec 6.17.
 *
 * The data exports of 6.17 all want the same thing about a hex and differ only in
 * how they write it down, so the reading is done once here and the formats take
 * what they need. Nothing in a record is new: it is the surface already on screen,
 * said in degrees and words rather than drawn.
 */

/** Degrees, which is what everything outside this application counts in. */
const DEG = 180 / Math.PI;

export interface HexRecord {
  /** The hex name of 2.4, which is the same name at every detail level. */
  readonly name: string;
  readonly cell: number;
  readonly latitude: number;
  readonly longitude: number;
  /** The generated height, 0 to 1, before the sea level is applied to it. */
  readonly height: number;
  /** Height relative to sea level, negative under water. */
  readonly relief: number;
  readonly terrain: string;
  readonly iced: boolean;
  readonly land: boolean;
  /** The colour the map paints it, so an export and the panel agree. */
  readonly colour: string;
  readonly sides: 5 | 6;
  /** The hex outline as latitude and longitude pairs, wound as it is drawn. */
  readonly outline: readonly (readonly [number, number])[];
  /** Whatever sits on the ground this hex covers. Spec 6.6.3. */
  readonly pois: readonly Poi[];
}

/** Latitude and longitude of a direction on the unit sphere, in degrees. */
export function latLon(p: Vec3): readonly [number, number] {
  return [Math.asin(Math.max(-1, Math.min(1, p[1]))) * DEG, Math.atan2(p[2], p[0]) * DEG];
}

export function hexRecords(surface: Surface, pois: readonly Poi[], refs?: RefIndex): HexRecord[] {
  const grid = surface.grid;
  const index = refs ?? buildRefIndex(grid);
  const byCell = new Map<number, Poi[]>();
  for (const { poi, cell } of poiPlacements(grid, pois)) {
    const list = byCell.get(cell);
    if (list) list.push(poi);
    else byCell.set(cell, [poi]);
  }

  return grid.cells.map((cell) => {
    const height = surface.heights[cell.id]!;
    const [latitude, longitude] = latLon(cell.centre);
    const iced = isIced(surface.caps, cell.centre[1]);
    return {
      name: formatRef(index.of[cell.id]!),
      cell: cell.id,
      latitude,
      longitude,
      height,
      relief: height - surface.seaLevel,
      terrain: terrainBand(height, surface.seaLevel, iced),
      iced,
      land: height > surface.seaLevel,
      colour: heightColour(height, surface.seaLevel, iced, surface.verdancy),
      sides: cell.isPentagon ? 5 : 6,
      outline: ring(cell.corners, longitude, latitude),
      pois: byCell.get(cell.id) ?? [],
    };
  });
}

/** How near a pole a hex centre has to be before the hex is treated as a cap. */
const POLE_LATITUDE = 89;

/**
 * A hex outline in degrees, wound as the corners come.
 *
 * Two things go wrong when a sphere is written down flat, and both are dealt with
 * here rather than left for the reader.
 *
 * A hex straddling the antimeridian has corners at +179 and -179, which as a ring
 * reads as a shape stretched right round the world. Each corner is brought within
 * half a turn of the hex's own centre, which carries a few of them past 180. That
 * is outside the range a coordinate is normally written in, and it is what
 * mapping software wants: one unbroken ring, in the place the hex actually is.
 *
 * The two hexes on the poles have no outline that works at all, since every
 * direction from a pole is south and the ring their corners make is a line across
 * the top of the map rather than a cap over it. Those two are closed over the pole
 * itself, which is the shape a polar cap is drawn as everywhere else.
 */
function ring(
  corners: readonly Vec3[],
  centreLon: number,
  centreLat: number,
): readonly (readonly [number, number])[] {
  const points = corners.map((corner) => {
    const [lat, lon] = latLon(corner);
    return [lat, unwrap(lon, centreLon)] as const;
  });
  if (Math.abs(centreLat) < POLE_LATITUDE) return points;
  const pole = centreLat > 0 ? 90 : -90;
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  return [...sorted, [pole, 180] as const, [pole, -180] as const];
}

/** A longitude moved by whole turns until it is within half a turn of `near`. */
function unwrap(lon: number, near: number): number {
  let out = lon;
  while (out - near > 180) out -= 360;
  while (near - out > 180) out += 360;
  return out;
}
