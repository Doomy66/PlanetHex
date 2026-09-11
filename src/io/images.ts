import { DETAIL_LEVELS } from "../grid/coord";
import { poiPlacements } from "../poi";
import { buildSurface, type Surface } from "../surface";
import { createHexMap, strokeWidths, type PoiMark } from "../ui/map";
import type { PlanetDetail } from "../gen/detail";
import type { Planet } from "../planet";

/**
 * The flat map, drawn to a PNG at a detail level. Spec 6.4.5.
 *
 * The same renderer draws these as draws the panel, on a map that is never put
 * in the document. A fresh map frames itself on the whole net at its first
 * render, so what comes out is the world entire rather than wherever the user
 * happens to have zoomed to.
 *
 * The same detached map is what the vector export of 6.17.1 writes out, since a
 * picture and its vector original should not be drawn two different ways.
 */

/** Wide enough to tell one hex from the next at level 48. Spec 6.4.5.2. */
export const WIDTH = 2048;

/**
 * The stylesheet rules the map leans on, repeated here because a serialised SVG
 * is drawn outside the document and takes nothing from style.css with it. The
 * two custom properties are set inline on the element by the renderer, so only
 * the rules that read them need to travel. Kept beside .hexmap in style.css.
 */
const STYLES = `
  polygon { stroke: #0d0f12; stroke-width: var(--hex-stroke, 0.006); }
  .selected-hex { fill: none; stroke-width: var(--mark-stroke, 0.006); }
  .face-outline { fill: none; stroke: #f2f4f8; stroke-width: 0.012; opacity: 0.45; }
  .poi-starport { --poi: #ff4d47; }
  .poi-comment { --poi: #d7dde6; }
  .poi-hex { fill: none; stroke: var(--poi); stroke-width: var(--mark-stroke, 0.006); }
  .scalebar path { fill: none; stroke: #dfe3ea; stroke-width: 3; vector-effect: non-scaling-stroke; }
  .scalebar text {
    fill: #dfe3ea;
    font-family: system-ui, sans-serif;
    paint-order: stroke;
    stroke: rgba(10, 12, 16, 0.8);
    stroke-width: 8px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .scalebar .scalebar-hex { fill: #b6becd; }
`;

/** The panel colour the map is normally seen against. Matches --bg. */
export const BACKGROUND = "#14161a";

const SVG_NS = "http://www.w3.org/2000/svg";

/** One PNG per level, keyed by the row count that produced it. */
export type MapImages = ReadonlyMap<number, Blob>;

/**
 * Draw the map at each of the levels asked for. Spec 6.4.5.4: which levels a save
 * writes is the user's to choose, and the ladder of 2.2.2 is only the default.
 */
export async function renderMaps(
  planet: Planet,
  detail: PlanetDetail,
  /** Whether the hex seams are off, as 4.3.7.1 has them on screen. */
  smooth: boolean,
  sizes: readonly number[] = DETAIL_LEVELS,
  onLevel?: (size: number) => void,
): Promise<MapImages> {
  const images = new Map<number, Blob>();
  for (const size of sizes) {
    onLevel?.(size);
    // Drawing a level holds the thread for as long as it takes, so the message
    // about the level being drawn is given a frame to reach the screen first.
    // Without this the whole run is one freeze with nothing said during it.
    await nextFrame();
    images.set(size, await renderMap(planet, detail, size, smooth));
  }
  return images;
}

/**
 * Hand the thread back, so a message about what is being drawn can reach the
 * screen before the next thing that holds it for seconds is started.
 *
 * A frame where there is a screen to reach: two of them, since the first only
 * gets as far as the style being recalculated. A plain turn where there is not,
 * because a browser stops giving frames to a tab nobody is looking at, and a
 * save that stops the moment the user goes to another tab is worse than a save
 * that draws on quietly and is finished when they come back.
 */
export function nextFrame(): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** A detached, self-contained map, and the pixel size it is written at. */
export interface MapDrawing {
  readonly svg: SVGSVGElement;
  readonly width: number;
  readonly height: number;
}

/**
 * The map as an SVG that carries everything it needs: its own copy of the rules
 * it reads out of style.css, its stroke widths worked out for the width it is
 * being written at, and a size in pixels so a reader that ignores the viewBox
 * still gets the right shape.
 */
export function drawMap(
  planet: Planet,
  detail: PlanetDetail,
  size: number,
  smooth: boolean,
  width = WIDTH,
  surface: Surface = buildSurface(planet, detail, size),
): MapDrawing {
  const map = createHexMap();
  map.render(
    surface.grid,
    surface.heights,
    surface.seaLevel,
    surface.diameterKm,
    surface.caps,
    surface.verdancy,
  );
  // A point of interest is one hex among thousands, and the marks are what say
  // where. Spec 5.5.
  map.setPois(marksFor(planet, surface.grid));

  const svg = map.element.cloneNode(true) as SVGSVGElement;
  const box = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(/\s+/).map(Number);
  const ratio = (box[3] ?? 1) / (box[2] ?? 1);
  const height = Math.round(width * ratio);

  // The seams of 4.3.7 by the same rule the panel uses, at the width the picture
  // is written at rather than the width of a panel this map was never in. What
  // the picture cannot work out for itself is whether the reader asked for them,
  // so that is handed to it: a save writes down the map that was on screen.
  const { seam, mark } = strokeWidths(size, width / (box[2] ?? 1), smooth);
  svg.style.setProperty("--hex-stroke", String(seam));
  svg.style.setProperty("--mark-stroke", String(mark));

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = STYLES;
  svg.insertBefore(style, svg.firstChild);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("xmlns", SVG_NS);
  // The hexes do not fill the net, and an SVG with nothing behind it is drawn on
  // whatever the reader's page happens to be. The raster path paints the same
  // colour onto its canvas.
  svg.style.setProperty("background-color", BACKGROUND);

  return { svg, width, height };
}

async function renderMap(
  planet: Planet,
  detail: PlanetDetail,
  size: number,
  smooth: boolean,
  width = WIDTH,
): Promise<Blob> {
  const drawing = drawMap(planet, detail, size, smooth, width);
  return rasterise(drawing);
}

/** The map as a picture at a width of the caller's choosing. Spec 6.20. */
export function renderMapAt(
  planet: Planet,
  detail: PlanetDetail,
  size: number,
  smooth: boolean,
  width: number,
): Promise<Blob> {
  return renderMap(planet, detail, size, smooth, width);
}

function marksFor(planet: Planet, grid: Parameters<typeof poiPlacements>[0]): PoiMark[] {
  const byCell = new Map<number, PoiMark["kind"]>();
  for (const { poi, cell } of poiPlacements(grid, planet.pois)) {
    // A hex carrying both is marked as a starport, as it is on screen.
    if (poi.kind === "starport" || !byCell.has(cell)) byCell.set(cell, poi.kind);
  }
  return [...byCell].map(([cell, kind]) => ({ cell, kind }));
}

/** A detached map as the text of an SVG file. */
export function serialise(drawing: MapDrawing): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(drawing.svg)}\n`;
}

/** Draw a detached SVG onto a canvas and take the PNG off it. */
export async function rasterise(drawing: MapDrawing): Promise<Blob> {
  const markup = new XMLSerializer().serializeToString(drawing.svg);
  // A blob URL rather than a data URL: at level 48 the markup runs to megabytes,
  // and encoding all of it into a URL is wasted work.
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = await load(url);
    const canvas = document.createElement("canvas");
    canvas.width = drawing.width;
    canvas.height = drawing.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw the map to an image.");
    // The map is drawn against the panel, and the hexes do not fill the net.
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, drawing.width, drawing.height);
    context.drawImage(image, 0, 0, drawing.width, drawing.height);
    return await toPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The map could not be drawn to an image."));
    image.src = url;
  });
}

export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The map image could not be encoded."));
    }, "image/png");
  });
}
