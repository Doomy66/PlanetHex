/**
 * Where a planet sits in the setting: a sector name and a four digit hex within
 * it, which is Traveller convention. Spec.md 6.14.
 *
 * This grid is nothing to do with the surface grid of section 2. A sector is a
 * flat 32 by 40 chart of star systems, one hex per system, and the four digits
 * are a column and a row on it. Nothing here reaches the generator: the location
 * says where the world is, not what it is like.
 */

/** Columns across a sector chart. */
export const SECTOR_COLS = 32;
/** Rows down a sector chart. */
export const SECTOR_ROWS = 40;

/** Columns and rows per subsector: four across and four down make the sixteen. */
const SUB_COLS = 8;
const SUB_ROWS = 10;

export interface SectorHex {
  /** 1 to SECTOR_COLS. */
  readonly col: number;
  /** 1 to SECTOR_ROWS. */
  readonly row: number;
}

/**
 * Reads a four digit location, or null if it is not one. Spaces are allowed
 * around and inside it, so "19 10" and " 1910 " both read as column 19, row 10,
 * but the digits themselves have to be a real square on the chart.
 */
export function parseSectorHex(text: string): SectorHex | null {
  const digits = text.replace(/\s+/g, "");
  if (!/^\d{4}$/.test(digits)) return null;
  const col = Number(digits.slice(0, 2));
  const row = Number(digits.slice(2));
  if (col < 1 || col > SECTOR_COLS) return null;
  if (row < 1 || row > SECTOR_ROWS) return null;
  return { col, row };
}

/** The canonical four digits, so 1,9 writes itself as 0109 rather than 19. */
export function formatSectorHex(hex: SectorHex): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hex.col)}${pad(hex.row)}`;
}

/**
 * The subsector a hex falls in, A to P. Derived rather than stored: the sixteen
 * subsectors are a fixed carve-up of the chart, so a typed subsector could only
 * ever agree with the hex or be wrong about it.
 */
export function subsectorLetter(hex: SectorHex): string {
  const across = Math.floor((hex.col - 1) / SUB_COLS);
  const down = Math.floor((hex.row - 1) / SUB_ROWS);
  return String.fromCharCode(65 + down * 4 + across);
}

export interface PlanetLocation {
  readonly sector: string;
  /** As the user typed it, so a half-finished entry is not thrown away. */
  readonly hex: string;
}

/**
 * The location in one line, for anywhere that wants to state it rather than edit
 * it. Empty when neither field has been filled in, and it says what it has when
 * only one of them has been.
 */
export function formatLocation(location: PlanetLocation): string {
  const sector = location.sector.trim();
  const hex = parseSectorHex(location.hex);
  if (hex === null) return sector;
  const square = `${formatSectorHex(hex)} (subsector ${subsectorLetter(hex)})`;
  return sector === "" ? square : `${sector} ${square}`;
}

/**
 * Splits an old single-field location into the two fields. Written for the saves
 * this build made before the format was settled, where the field was free text
 * and by convention ended with the hex.
 */
export function splitLegacyLocation(text: string): PlanetLocation {
  const match = /^(.*?)[\s,]*(\d{4})\s*$/.exec(text.trim());
  if (match && parseSectorHex(match[2]!) !== null) {
    return { sector: match[1]!.trim(), hex: match[2]! };
  }
  return { sector: text.trim(), hex: "" };
}
