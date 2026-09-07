import { buildGrid, type Grid } from "./grid/grid";
import { heightsOn, referenceHeightsOn, seaLevelFor } from "./gen/height";
import { fieldOptionsFor } from "./gen/shape";
import { iceCapsFor, type IceCaps } from "./gen/ice";
import { verdancyFor } from "./gen/life";
import { buildHeightField, type HeightField, type HeightFieldOptions } from "./gen/field";
import { REFERENCE_SIZE } from "./grid/coord";
import type { PlanetDetail } from "./gen/detail";
import { DEFAULT_SEA_LEVEL } from "./ui/colour";
import type { Planet } from "./planet";

/**
 * Everything the map and the globe need to draw a world at one detail level.
 *
 * Held apart from the application state so the images written out by a save are
 * built the same way as the surface on screen. Spec 3.2.4: the field is the same
 * at every level, so the only thing that varies below is the grid it is sampled
 * on.
 */
export interface Surface {
  readonly grid: Grid;
  readonly options: HeightFieldOptions;
  readonly heights: Float64Array;
  /**
   * The field these heights were read off. Held so another grid of the same world
   * can be sampled without building the field again, which is what the globe's own
   * grid of 4.4.9 is read off.
   */
  readonly field: HeightField;
  readonly seaLevel: number;
  readonly diameterKm: number | null;
  readonly caps: IceCaps | null;
  readonly verdancy: number;
}

/** The surface on a grid already built. Spec 3.4: the UWP shapes the terrain, so
 *  editing a digit redraws the world without rebuilding the hexes under it. */
/**
 * The field last built, and what it was built from. Spec 3.2.4.1.
 *
 * A field is decided by the seed and the two knobs the UWP sets, and by nothing
 * else: not by the detail level, not by the tilt, not by the hydrographics digit.
 * So moving the slider, leaning the axis, or drying the world out asks for a field
 * that has just been built, and building it again is the most expensive thing the
 * application does. One is kept, since one is all a redraw ever wants.
 */
let held: { readonly key: string; readonly field: HeightField } | null = null;

function fieldFor(seed: string, options: HeightFieldOptions): HeightField {
  const key = `${seed}|${options.roughness}|${options.persistence}|${options.seedSpread}`;
  if (held?.key === key) return held.field;
  const field = buildHeightField(seed, REFERENCE_SIZE, options);
  held = { key, field };
  return field;
}

export function surfaceOn(planet: Planet, detail: PlanetDetail, grid: Grid): Surface {
  const options = fieldOptionsFor(detail, planet.uwp);
  // One field, sampled for the cells on screen and for the lattice sea level is
  // read off. Both used to build their own, which was the same expensive work
  // done twice, and it is kept between redraws for the same reason.
  const field = fieldFor(planet.seed, options);
  return {
    grid,
    options,
    field,
    heights: heightsOn(field, grid),
    // Off the reference lattice rather than off the cells on screen, so the
    // coastline does not move when the detail level does. Spec 5.2.4.
    seaLevel:
      detail.hydrographicsPct === null
        ? DEFAULT_SEA_LEVEL
        : seaLevelFor(referenceHeightsOn(field), detail.hydrographicsPct / 100),
    diameterKm: detail.diameterKm,
    caps: iceCapsFor(planet.uwp, detail),
    verdancy: verdancyFor(planet.uwp, detail),
  };
}

/** The surface at a detail level, grid and all. */
export function buildSurface(planet: Planet, detail: PlanetDetail, size: number): Surface {
  return surfaceOn(planet, detail, buildGrid(size));
}
