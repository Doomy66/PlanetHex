/**
 * Turning a published border path into something that can be drawn.
 * AppSpec 8.8.
 *
 * A border arrives as a closed ring of hexes — the hexes along the inside of
 * the boundary, in order. That is not a shape: it is the edge of one, and what
 * a map draws is the outline of everything the ring encloses, which includes
 * the empty hexes in the middle that no world marks.
 *
 * So there are two steps. Fill the ring to find out which hexes are inside it,
 * then keep every edge of those hexes that has nothing inside on the far side.
 * What is left is the outline.
 *
 * Pure, and over at most a sector of hexes, so it is cheap and it is testable
 * without a map.
 */

import { neighboursOf, parseAnyHex, type SectorHex } from "../location";
import { SECTOR_COLS, SECTOR_ROWS } from "../location";

/** How far outside a sector a border is followed before it is given up on. */
const ROOM = 2;

/**
 * Every hex a border path encloses, the ring itself included.
 *
 * Filled from the outside in rather than the inside out, because there is no
 * reliable way to pick a hex that is inside: a border can be one hex wide, and
 * the middle of its bounding box can easily be outside it. Flooding the
 * outside needs no such guess — a corner of a box drawn round the whole thing
 * with room to spare is outside by construction — and what the flood does not
 * reach is what the ring encloses.
 */
export function hexesWithin(path: readonly string[]): Set<string> {
  const ring = new Set<string>();
  const hexes: SectorHex[] = [];
  for (const written of path) {
    const hex = parseAnyHex(written);
    if (hex === null) continue;
    const key = keyOf(hex);
    if (!ring.has(key)) hexes.push(hex);
    ring.add(key);
  }
  if (hexes.length === 0) return ring;

  const lowCol = Math.min(...hexes.map((hex) => hex.col)) - ROOM;
  const highCol = Math.max(...hexes.map((hex) => hex.col)) + ROOM;
  const lowRow = Math.min(...hexes.map((hex) => hex.row)) - ROOM;
  const highRow = Math.max(...hexes.map((hex) => hex.row)) + ROOM;
  const inBox = (hex: SectorHex) =>
    hex.col >= lowCol && hex.col <= highCol && hex.row >= lowRow && hex.row <= highRow;

  const outside = new Set<string>();
  const queue: SectorHex[] = [{ col: lowCol, row: lowRow }];
  outside.add(keyOf(queue[0]!));
  while (queue.length > 0) {
    const here = queue.pop()!;
    for (const next of neighboursOf(here)) {
      if (!inBox(next)) continue;
      const key = keyOf(next);
      if (outside.has(key) || ring.has(key)) continue;
      outside.add(key);
      queue.push(next);
    }
  }

  const within = new Set<string>();
  for (let col = lowCol; col <= highCol; col++) {
    for (let row = lowRow; row <= highRow; row++) {
      const key = keyOf({ col, row });
      if (!outside.has(key)) within.add(key);
    }
  }
  return within;
}

/**
 * The edges of a region that face out of it, as pairs of hex and which of its
 * six sides.
 *
 * The side is an index into the neighbours of [location.ts](../location.ts),
 * which are in the same order as the corners of a hex, so side `n` runs from
 * corner `n` to corner `n + 1`. That is the whole trick: an edge belongs to
 * the outline exactly when the hex across it is not in the region.
 */
export function outlineOf(within: ReadonlySet<string>): { hex: SectorHex; side: number }[] {
  const edges: { hex: SectorHex; side: number }[] = [];
  for (const key of within) {
    const hex = fromKey(key);
    if (hex === null) continue;
    for (const [side, next] of neighboursOf(hex).entries()) {
      if (!within.has(keyOf(next))) edges.push({ hex, side });
    }
  }
  // In a settled order, so the same border draws the same way every time and a
  // test can say what it expects.
  return edges.sort((a, b) => keyOf(a.hex).localeCompare(keyOf(b.hex)) || a.side - b.side);
}

/** The outline of a published border, ready to be turned into a line. */
export function borderEdges(path: readonly string[]): { hex: SectorHex; side: number }[] {
  return outlineOf(hexesWithin(path));
}

/**
 * A key that survives a hex outside the sector, which formatSectorHex cannot
 * write: it pads to two digits and a border may walk to column 0 or past 32.
 */
function keyOf(hex: SectorHex): string {
  return `${hex.col},${hex.row}`;
}

function fromKey(key: string): SectorHex | null {
  const [col, row] = key.split(",").map(Number);
  if (col === undefined || row === undefined || !Number.isFinite(col) || !Number.isFinite(row)) {
    return null;
  }
  return { col, row };
}

/** Whether a hex is one the sector itself draws, as opposed to a neighbour's. */
export function onTheMap(hex: SectorHex): boolean {
  return hex.col >= 1 && hex.col <= SECTOR_COLS && hex.row >= 1 && hex.row <= SECTOR_ROWS;
}
