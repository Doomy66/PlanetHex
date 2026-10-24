/**
 * Telling one polity's border from another's. AppSpec 8.8.4.
 *
 * Every border drawn in one colour is a tangle wherever two of them run
 * alongside each other, which on a real map is exactly where the interesting
 * ground is - the Darrian, Sword Worlds and Imperial frontiers in the Spinward
 * Marches are within a few hexes of each other for most of their length.
 *
 * So each allegiance gets a look of its own. Not simply a colour: three hues
 * is as many as can be told apart on this surface by somebody with any of the
 * common colour deficiencies, and a sector can easily hold four polities or
 * five. What carries identity here is a hue *and* a dash, which gives nine
 * that differ in at least one channel nobody is blind to, and every border
 * also wears its name.
 */

/**
 * The three hues, in fixed order.
 *
 * Steps from the standard categorical ramp, chosen for a dark surface and
 * checked rather than eyeballed: against the map's own #0a0c10 all three pass
 * the lightness band, the chroma floor, 3:1 contrast, and - with every pair
 * tested, not just neighbours - colour-deficient separation. A fourth hue from
 * the same ramp fails that last check, which is why the dash exists.
 */
const HUES = ["#3987e5", "#d95926", "#199e70"] as const;

/**
 * The three dashes, in fixed order. Solid first, so the commonest polity in a
 * sector gets the plainest line.
 *
 * Lengths are in the map's own drawing units, where a hex is 100 across, so a
 * dash is a fair fraction of a hex side and survives being zoomed out.
 */
const DASHES = ["", "26 14", "40 12 6 12"] as const;

export interface PolityLook {
  readonly colour: string;
  /** An SVG stroke-dasharray, or "" for a solid line. */
  readonly dash: string;
}

/**
 * How each allegiance in a document is drawn.
 *
 * Keyed on the codes the document holds, sorted, so a polity's look depends on
 * who else is in the sector and not on what order the borders happened to
 * arrive in. The same sector always draws the same way, and nothing repaints
 * because a border was added below it in the list.
 */
export function polityLooks(codes: readonly string[]): Map<string, PolityLook> {
  const distinct = [...new Set(codes.filter((code) => code.trim() !== ""))].sort();
  const looks = new Map<string, PolityLook>();
  for (const [at, code] of distinct.entries()) {
    looks.set(code, {
      colour: HUES[at % HUES.length]!,
      // Past the three hues the dash changes, so the fourth polity is a blue
      // line that is dashed rather than a fourth colour nobody can place.
      dash: DASHES[Math.floor(at / HUES.length) % DASHES.length]!,
    });
  }
  return looks;
}

/** What a border with no allegiance at all is drawn as. */
export const UNCLAIMED: PolityLook = { colour: "#8a8f98", dash: "6 10" };

export function lookFor(looks: ReadonlyMap<string, PolityLook>, code: string): PolityLook {
  return looks.get(code) ?? UNCLAIMED;
}
