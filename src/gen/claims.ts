/**
 * Borders worked out from who holds the worlds. AppSpec 9.5.
 *
 * A published sector's borders are a cartographer's judgement and arrive drawn.
 * A sector somebody rolled has none, and the allegiance column is the only
 * thing in it that says whose space a hex is — so that is what the frontier is
 * drawn from.
 *
 * The hull of the worlds alone would be wrong, because a polity holds the empty
 * hexes between its worlds and no world marks them. Two things close that: the
 * fill in [border.ts](border.ts) takes in whatever a claim encloses, and a
 * referee can claim a hex outright, which is what the map's claim mode writes.
 *
 * Pure: worlds and written claims in, border paths out, no map and no document.
 */

import type { BorderPath } from "../charted-map";
import type { AllegianceName } from "../charted-map";
import { UNALIGNED } from "./subsector";

/** The little a hex has to say for itself to be claimed by somebody. */
export interface ClaimableHex {
  readonly at: string;
  readonly allegiance: string;
}

/**
 * Who claims each hex, as a code against the hexes that wear it.
 *
 * The referee's word first: a hex they have claimed belongs to whoever they
 * said, and a hex they have unclaimed belongs to nobody however its world is
 * marked. Everything else follows the world. Non-aligned claims nothing, since
 * "nobody holds this" is not a polity to draw a line around.
 */
export function claimsFor(
  worlds: readonly ClaimableHex[],
  written: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const put = (code: string, at: string) => {
    const wanted = code.trim();
    if (wanted === "" || wanted === UNALIGNED) return;
    const held = out.get(wanted);
    if (held === undefined) out.set(wanted, [at]);
    else held.push(at);
  };

  const done = new Set<string>();
  // The written claims first, so a hex with no world in it is still claimed -
  // which is the whole point of being able to write one.
  for (const [at, code] of written) {
    done.add(at);
    put(code, at);
  }
  for (const world of worlds) {
    if (done.has(world.at)) continue;
    put(world.allegiance, world.at);
  }

  for (const hexes of out.values()) hexes.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * The borders to draw that nothing published already draws.
 *
 * Only for a polity whose row asks for one. Naming a code is not asking: a
 * published table names everything a world can be, the client states and the
 * unclaimed among them, and ringing those would put a frontier round every
 * scrap of space nobody holds. The row carries the answer, and the dialog
 * starts a row the referee adds with it ticked. AppSpec 9.5.2.
 *
 * A published border wins over a derived one for the same polity, so importing
 * the Spinward Marches and then marking a few more hexes Imperial does not
 * draw a second, cruder Imperium over the real one.
 */
export function derivedBorders(
  worlds: readonly ClaimableHex[],
  written: ReadonlyMap<string, string>,
  published: readonly BorderPath[],
  named: readonly AllegianceName[],
): BorderPath[] {
  const drawn = new Set(published.map((border) => border.allegiance.toLowerCase()));
  const names = new Map(named.map((one) => [one.code.toLowerCase(), one]));
  const out: BorderPath[] = [];

  for (const [code, hexes] of claimsFor(worlds, written)) {
    const key = code.toLowerCase();
    if (drawn.has(key)) continue;
    const name = names.get(key);
    if (name === undefined || name.border !== true) continue;
    out.push({
      allegiance: code,
      // The label the map writes along the frontier, which is the short name
      // where there is one: a border is labelled in the room a border has.
      label: name.short.trim() !== "" && name.short !== "NA" ? name.short : name.name,
      // Nothing says where it should sit, so the map puts it where it can.
      labelAt: "",
      hexes,
    });
  }

  // Settled order, so the same sector draws the same way twice and the colours
  // of ui/polity.ts do not depend on which polity was marked first.
  return out.sort((a, b) => a.allegiance.localeCompare(b.allegiance));
}

/**
 * The published borders and the worked-out ones together, for a map to draw.
 *
 * The derived ones last, so where two frontiers share an edge the published
 * line is the one underneath and the referee's own sits over it.
 */
export function bordersToDraw(
  published: readonly BorderPath[],
  derived: readonly BorderPath[],
): BorderPath[] {
  return [...published, ...derived];
}
