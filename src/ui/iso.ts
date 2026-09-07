/**
 * Where a point of the local patch lands when the patch is stood up and looked at
 * from over it rather than from above it. Spec 4.5.9.
 *
 * The ground itself is drawn as lit ground by relief.ts, through a camera. This is
 * the same view written out as arithmetic, for everything that has to be drawn
 * over that ground in the panel's SVG: the ring round the selected hex, the marks
 * on the points of interest, and the scale bar. Both have to be one view, or the
 * marks would sit off the ground they are about.
 *
 * Seen from thirty degrees above, a step of depth into the drawing is worth the
 * sine of that angle and a step of height is worth the cosine. So the ground plane
 * squashes to half and height is what is left. Distance stays true across the
 * drawing and is foreshortened up it, which is what lets the scale bar of 4.6
 * stand in this view unchanged: it is drawn horizontally, along the axis that kept
 * its scale.
 *
 * Height is exaggerated by a fixed amount rather than stretched to fill the panel.
 * A patch of gentle ground is drawn as gentle ground, and two patches of the same
 * world can be read against each other. Spec 4.5.9.3.
 */

export type Pt2 = readonly [number, number];

/** How far above the ground the patch is seen from. Spec 4.5.9.1. */
export const ANGLE_DEG = 30;

export const ANGLE = (ANGLE_DEG * Math.PI) / 180;

/** What a step of depth into the drawing is worth, going up it. */
export const SQUASH = Math.sin(ANGLE);

/**
 * Drawing units the whole range of height stands, before the angle takes its
 * share. One step between hex centres is one unit, so this is how many hexes tall
 * the ground would be if it ran from the floor of the height field to the ceiling
 * of it.
 *
 * Some exaggeration there has to be: a patch is hundreds of kilometres across and
 * the ground on it rises by single kilometres, so drawn to the truth of it a
 * mountain range would be a flat sheet. Set where a rough patch reads as hills
 * rather than as spikes, which is a good deal lower than the height field's own
 * roughness would suggest, since the field is noise all the way down and the eye
 * reads every sample of it as a peak.
 */
export const EXAGGERATION = 20;

/** What a unit of height is worth up the drawing, once seen from the angle. */
export const RELIEF = EXAGGERATION * Math.cos(ANGLE);

/** How much earth is left under the lowest ground of the patch. Spec 4.5.9.3. */
export const BASE_DROP = 1.8;

export interface Iso {
  /** Where a point of ground at a height lands in the drawing. */
  place(x: number, y: number, h: number): Pt2;
  /** How far a height lifts a point off the ground plane. */
  rise(h: number): number;
  /** Where the floor of the block lands, under a point of ground at that depth. */
  floor(y: number): number;
}

/** The view, with the ground plane set at the height the patch is cut off at. */
export function isoView(base: number): Iso {
  const rise = (h: number) => (h - base) * RELIEF;
  return {
    rise,
    // Up the drawing is down in y, so a rise is subtracted.
    place: (x, y, h) => [x, y * SQUASH - rise(h)],
    floor: (y) => y * SQUASH + BASE_DROP * Math.cos(ANGLE),
  };
}
