import type { HexRecord } from "./cells";

/**
 * The hexes as a table. Spec 6.17.3.
 *
 * One row per hex of the level being exported, in the order the grid holds them,
 * which is the order their names sort in. A spreadsheet, a die-roll table, or a
 * few lines of somebody else's script can all read this, which is the point of
 * offering it beside the map files: not every tool draws.
 *
 * Comma separated with the header row RFC 4180 asks for, CRLF line endings, and
 * every field quoted that could otherwise be misread. Written as text rather than
 * through a library, since the whole format is two rules and neither is subtle.
 */

const COLUMNS = [
  "hex",
  "latitude",
  "longitude",
  "height",
  "relief",
  "terrain",
  "land",
  "iced",
  "sides",
  "colour",
  "poi_kind",
  "poi_name",
  "poi_narrative",
] as const;

export function hexCsv(records: readonly HexRecord[]): string {
  const lines = [COLUMNS.join(",")];
  for (const record of records) {
    // A hex covering several points of interest is one row, since the row is
    // about the hex. The names are joined rather than one of them chosen, so
    // nothing written on the world is quietly dropped on the way out. Spec 6.6.3.
    const kinds = record.pois.map((poi) => poi.kind).join("; ");
    const names = record.pois.map((poi) => poi.name).join("; ");
    const notes = record.pois.map((poi) => poi.narrative).join("\n\n");
    lines.push(
      [
        record.name,
        record.latitude.toFixed(4),
        record.longitude.toFixed(4),
        record.height.toFixed(6),
        record.relief.toFixed(6),
        record.terrain,
        record.land ? "land" : "sea",
        record.iced ? "yes" : "no",
        String(record.sides),
        record.colour,
        kinds,
        names,
        notes,
      ]
        .map(field)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * A value as one CSV field. Quoted where it holds a comma, a quote, or a line
 * break, and a quote inside a quoted field is doubled, which is the whole of the
 * escaping the format has.
 */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
