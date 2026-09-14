/**
 * A world as a picture: the globe of the planet spec 4.4, drawn small.
 *
 * The system view shows worlds it is not opening - a row of them on the diagram
 * and one beside the profile in the panel - and a dot with a colour picked for
 * it would be an icon rather than the world. These are the same surface the
 * planet view draws, built the same way and photographed once.
 *
 * One hidden renderer does all of them, because a WebGL context is a scarce
 * thing and a system can hold several worlds. The pictures are cached by what
 * they were drawn from, so selecting around a system costs nothing after the
 * first look.
 */

import { buildGrid } from "../grid/grid";
import { SPHERE_SIZE } from "../grid/coord";
import { planetDetail } from "../gen/detail";
import { newPlanet } from "../planet";
import { shaderFor, surfaceOn } from "../surface";
import { createGlobe, type Globe } from "./globe";

/**
 * The detail level these are built at. Six rows is 362 hexes, which at the size
 * a world is drawn here is more than the picture can show, and it is a fiftieth
 * of the work the map's own level would be. Under the planet spec 3.2.4 it is
 * the same world either way: a coarser level resolves less of it, not something
 * else.
 */
const THUMBNAIL_ROWS = 12;

/**
 * The level the globe in the panel is built at. That panel is the one place a
 * world is looked at rather than glanced at, so it gets a real coastline rather
 * than the thumbnails' outline.
 *
 * Half the planet view's own globe of SPHERE_SIZE, and a quarter of the work.
 * The planet view pays that once when a world is opened; here a world is picked
 * out of a list and put back, and a second and a half a click is the difference
 * between looking around a system and waiting on one.
 */
const LIVE_ROWS = SPHERE_SIZE / 2;

export interface WorldPicture {
  readonly seed: string;
  readonly uwp: string;
  readonly orbitAu: number;
  readonly luminosity: number;
}

const cache = new Map<string, string>();
let globe: Globe | null = null;
let host: HTMLElement | null = null;
let live: Globe | null = null;

/** The renderer, made on first use and kept: a GL context is not free. */
function renderer(px: number): Globe {
  if (globe === null) {
    host = document.createElement("div");
    // Off the page rather than hidden: a display of none gives an element no
    // size, and a renderer with no size draws nothing to photograph.
    host.style.cssText =
      "position:absolute;left:-10000px;top:0;width:256px;height:256px;pointer-events:none";
    globe = createGlobe({ forSnapshots: true });
    host.append(globe.element);
    document.body.append(host);
  }
  if (host !== null) {
    host.style.width = `${px}px`;
    host.style.height = `${px}px`;
  }
  return globe;
}

/**
 * The world on screen and turning, for the panel that has room for one.
 *
 * A globe of its own rather than a picture, because a picture cannot turn and
 * the planet spec 4.4.2 has a world turn on its own axis. One instance, moved
 * from panel to panel and re-rendered, since a GL context is not free.
 */
export function liveGlobe(world: WorldPicture): HTMLElement {
  if (live === null) live = createGlobe();
  const { grid, surface, detail } = surfaceFor(world, LIVE_ROWS);
  live.render(
    grid,
    surface.heights,
    surface.diameterKm,
    surface.caps,
    shaderFor(surface, "orbital"),
    surface.clouds,
    detail.axialTiltDeg,
  );
  live.resetView();
  return live.element;
}

/** Everything a picture of a world is built from, which is what a save holds. */
function surfaceFor(world: WorldPicture, rows = THUMBNAIL_ROWS) {
  const planet = {
    ...newPlanet(world.seed),
    uwp: world.uwp,
    orbitAu: world.orbitAu,
    luminosity: world.luminosity,
    size: rows,
  };
  const detail = planetDetail(planet.seed, planet.uwp, {
    orbitAu: planet.orbitAu,
    luminosity: planet.luminosity,
  });
  const grid = buildGrid(rows);
  return { grid, detail, surface: surfaceOn(planet, detail, grid) };
}

/**
 * A PNG of one world, at the size asked for.
 *
 * Everything it needs is what a save holds: the seed builds the surface and the
 * profile and the two settings shape it, which is the planet spec 6.15.13.2 in
 * miniature. A world drawn here and the same world opened as a planet are the
 * same world.
 */
export function worldImage(world: WorldPicture, px: number): string {
  const key = `${world.seed}|${world.uwp}|${world.orbitAu}|${world.luminosity}|${px}`;
  const held = cache.get(key);
  if (held !== undefined) return held;

  const { grid, surface, detail } = surfaceFor(world);

  const drawn = renderer(px);
  drawn.render(
    grid,
    surface.heights,
    surface.diameterKm,
    surface.caps,
    // The orbital view of the planet spec 5.7, which is the one a world opens in
    // and the one that says what the ground is at a glance.
    shaderFor(surface, "orbital"),
    surface.clouds,
    detail.axialTiltDeg,
  );
  const url = drawn.snapshot(px);
  cache.set(key, url);
  return url;
}
