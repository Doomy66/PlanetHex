import type { HexRecord } from "./cells";
import type { Planet } from "../../planet";

/**
 * The hexes as GeoJSON. Spec 6.17.2.
 *
 * A feature per hex, with the hex outline as its geometry and everything the
 * table of 6.17.3 carries as its properties, so QGIS, Leaflet, or anything else
 * that reads RFC 7946 opens the world as a map rather than as a picture of one.
 * The points of interest come as their own features afterwards, since a point is
 * a point and marking it on the hex covering it would lose where it actually is.
 *
 * Longitude before latitude, which is the order the format counts in and the
 * opposite of the order the panel reads them out in. A ring is closed by
 * repeating its first position, which the format requires and a drawn hexagon
 * does not.
 */

export interface GeoJsonOptions {
  /** Written into the collection so the file says which world it is. */
  readonly planet: Planet;
  /** Rows per face of the level exported, so the resolution is on the record. */
  readonly size: number;
  readonly seaLevel: number;
  readonly diameterKm: number | null;
}

export function hexGeoJson(records: readonly HexRecord[], options: GeoJsonOptions): string {
  const features: unknown[] = records.map((record) => ({
    type: "Feature",
    id: record.name,
    properties: {
      hex: record.name,
      height: round(record.height, 6),
      relief: round(record.relief, 6),
      terrain: record.terrain,
      land: record.land,
      iced: record.iced,
      sides: record.sides,
      // Named as most stylers look for it, so a hex draws in the colour the
      // panel gave it before anybody has written a rule.
      fill: record.colour,
      poi: record.pois.length === 0 ? null : record.pois.map((poi) => poi.name).join("; "),
    },
    geometry: {
      type: "Polygon",
      coordinates: [close(record.outline)],
    },
  }));

  // A point of interest sits where it was placed, which under 2.4.8 is a point
  // far finer than the hexes above. Spec 6.17.2.2.
  for (const record of records) {
    for (const poi of record.pois) {
      features.push({
        type: "Feature",
        properties: {
          kind: poi.kind,
          name: poi.name,
          narrative: poi.narrative,
          hex: record.name,
        },
        geometry: { type: "Point", coordinates: [round(record.longitude, 6), round(record.latitude, 6)] },
      });
    }
  }

  return JSON.stringify(
    {
      type: "FeatureCollection",
      // Not part of RFC 7946, which allows foreign members and says readers
      // should keep them. A file that cannot say which world it is would have to
      // be named carefully for ever after.
      planethex: {
        name: options.planet.name,
        uwp: options.planet.uwp,
        seed: options.planet.seed,
        sector: options.planet.sector,
        hex: options.planet.hex,
        detail: options.size,
        seaLevel: round(options.seaLevel, 6),
        diameterKm: options.diameterKm,
      },
      features,
    },
    null,
    1,
  );
}

/** A ring in GeoJSON order and closed, from an outline in latitude-first pairs. */
function close(
  outline: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const ring = outline.map(([lat, lon]) => [round(lon, 6), round(lat, 6)] as const);
  const first = ring[0];
  if (first === undefined) return ring;
  return [...ring, first];
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
