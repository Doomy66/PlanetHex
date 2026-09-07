/**
 * Contour lines over the local patch. Spec 4.5.8.
 *
 * A line is drawn between two neighbouring hexes whose heights fall either side
 * of a level, along the side they share. So a contour runs on the hex boundaries
 * rather than across the hexes, and every hex is wholly on one side of it: the
 * line and the colours it separates say the same thing, which is what lets the
 * seams of the patch be dropped everywhere a line is not. Spec 4.5.8.7.
 *
 * That leaves a line stepping from side to side rather than a smooth one, which
 * is what a hex map is: the ground is known a hex at a time, and a smooth line
 * drawn through the middle of them claims to know where inside a hex the height
 * is passed. It does not.
 *
 * The lines come back in lattice steps rather than in drawing units, since the
 * caller is the one that knows how a step is laid out on the face it is drawing.
 */

/** A point in the patch, in fractional lattice steps from its centre. */
export type Step = readonly [number, number];

export interface ContourSegment {
  readonly from: Step;
  readonly to: Step;
}

/** One level, and every piece of it the patch holds. */
export interface Contour {
  readonly level: number;
  readonly segments: readonly ContourSegment[];
}

/** About how many lines a patch should carry. More than this and it reads as hatching. */
const MOST_LINES = 9;

export interface ContourPlan {
  /** Height between neighbouring lines. Zero where there is nothing to draw. */
  readonly step: number;
  readonly levels: readonly number[];
}

/**
 * The levels to draw across a span of heights, counted from a datum.
 *
 * The interval is a round figure at or above the span divided by the line count,
 * for the reason 4.6.3 gives the scale bar: a fixed interval draws one line on a
 * flat plain and fifty on a mountainside, and neither is a map. Counting from the
 * datum rather than from the lowest sample is what puts a line on the coast, and
 * keeps the lines still while the pointer moves from one patch to the next.
 */
export function planContours(
  low: number,
  high: number,
  datum: number,
  most: number = MOST_LINES,
): ContourPlan {
  const span = high - low;
  if (!(span > 0) || !Number.isFinite(span) || most < 1) return { step: 0, levels: [] };
  const step = niceStep(span / most);
  const levels: number[] = [];
  // Nudged, because a level sitting exactly on the end of the span arrives there
  // as a count a hair over a whole number and would be rounded off the list.
  const first = Math.ceil((low - datum) / step - 1e-9);
  const last = Math.floor((high - datum) / step + 1e-9);
  // A patch narrower than one interval still gets the line through it, if the
  // datum happens to fall inside. Otherwise it gets none, which is the truth.
  for (let k = first; k <= last; k++) levels.push(datum + k * step);
  return { step, levels };
}

/** The 1, 2 or 5 times a power of ten at or above a height. */
export function niceStep(h: number): number {
  if (!(h > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(h));
  for (const step of [1, 2, 5]) if (power * step >= h) return power * step;
  return power * 10;
}

/**
 * The three neighbours a hex is walked towards, and the side it shares with each.
 *
 * Three rather than six, so each side of the patch is considered once. The sides
 * are named by their two corners, in thirds of a step from the hex's own centre,
 * which is how the hexagon of the grid's dual is built.
 */
const SIDES: readonly { readonly step: Step; readonly corners: readonly [Step, Step] }[] = [
  { step: [1, 0], corners: [[1 / 3, 1 / 3], [2 / 3, -1 / 3]] },
  { step: [0, 1], corners: [[1 / 3, 1 / 3], [-1 / 3, 2 / 3]] },
  { step: [-1, 1], corners: [[-1 / 3, 2 / 3], [-2 / 3, 1 / 3]] },
];

/**
 * Every level traced over the window, given the height at a lattice offset and how
 * far the window reaches. A null height is a hex the patch could not place, and a
 * side with one on either end is left alone rather than guessed at.
 *
 * A side carries a level where the level is above the lower of its two heights and
 * at or below the higher, which is the same as saying one hex is at or above the
 * level and the other is below it. Two hexes of the same height therefore carry
 * nothing, whatever their height is, so a level lying exactly on the ground is no
 * more trouble here than any other.
 */
export function traceContours(
  heightAt: (dp: number, dq: number) => number | null,
  reach: number,
  levels: readonly number[],
): Contour[] {
  const out = levels.map((level) => ({ level, segments: [] as ContourSegment[] }));
  if (out.length === 0) return out;

  for (let dp = -reach; dp <= reach; dp++) {
    for (let dq = -reach; dq <= reach; dq++) {
      const here = heightAt(dp, dq);
      if (here === null) continue;
      for (const side of SIDES) {
        const there = heightAt(dp + side.step[0], dq + side.step[1]);
        if (there === null) continue;
        const low = here < there ? here : there;
        const high = here < there ? there : here;
        if (low === high) continue;
        for (const line of out) {
          if (line.level <= low || line.level > high) continue;
          const [a, b] = side.corners;
          line.segments.push({
            from: [dp + a[0], dq + a[1]],
            to: [dp + b[0], dq + b[1]],
          });
        }
      }
    }
  }
  return out;
}
