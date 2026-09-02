import { buildGrid, type Grid } from "./grid/grid";
import { generateHeights, referenceHeights, seaLevelFor } from "./gen/height";
import { fieldOptionsFor } from "./gen/shape";
import { iceCapsFor, type IceCaps } from "./gen/ice";
import { verdancyFor } from "./gen/life";
import type { HeightFieldOptions } from "./gen/field";
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
  readonly seaLevel: number;
  readonly diameterKm: number | null;
  readonly caps: IceCaps | null;
  readonly verdancy: number;
}

/** The surface on a grid already built. Spec 3.4: the UWP shapes the terrain, so
 *  editing a digit redraws the world without rebuilding the hexes under it. */
export function surfaceOn(planet: Planet, detail: PlanetDetail, grid: Grid): Surface {
  const options = fieldOptionsFor(detail, planet.uwp);
  return {
    grid,
    options,
    heights: generateHeights(grid, planet.seed, options),
    // Off the reference lattice rather than off the cells on screen, so the
    // coastline does not move when the detail level does. Spec 5.2.4.
    seaLevel:
      detail.hydrographicsPct === null
        ? DEFAULT_SEA_LEVEL
        : seaLevelFor(referenceHeights(planet.seed, options), detail.hydrographicsPct / 100),
    diameterKm: detail.diameterKm,
    caps: iceCapsFor(planet.uwp, detail),
    verdancy: verdancyFor(planet.uwp, detail),
  };
}

/** The surface at a detail level, grid and all. */
export function buildSurface(planet: Planet, detail: PlanetDetail, size: number): Surface {
  return surfaceOn(planet, detail, buildGrid(size));
}
