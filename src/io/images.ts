import { DETAIL_LEVELS } from "../grid/coord";
import { poiPlacements } from "../poi";
import { buildSurface } from "../surface";
import { createHexMap, type PoiMark } from "../ui/map";
import type { PlanetDetail } from "../gen/detail";
import type { Planet } from "../planet";

/**
 * The flat map, drawn to a PNG at every detail level. Spec 6.4.5.
 *
 * The same renderer draws these as draws the panel, on a map that is never put
 * in the document. A fresh map frames itself on the whole net at its first
 * render, so what comes out is the world entire rather than wherever the user
 * happens to have zoomed to.
 */

/** Wide enough to tell one hex from the next at level 48. Spec 6.4.5.2. */
const WIDTH = 2048;

/**
 * The stylesheet rules the map leans on, repeated here because a serialised SVG
 * is drawn outside the document and takes nothing from style.css with it. The
 * two custom properties are set inline on the element by the renderer, so only
 * the rules that read them need to travel. Kept beside .hexmap in style.css.
 */
const STYLES = `
  polygon { stroke: #0d0f12; stroke-width: var(--hex-stroke, 0.006); }
  .face-outline { fill: none; stroke: #f2f4f8; stroke-width: 0.012; opacity: 0.45; }
  .poi-starport { --poi: #ff4d47; }
  .poi-comment { --poi: #d7dde6; }
  .poi-hex { fill: none; stroke: var(--poi); stroke-width: var(--hex-stroke, 0.006); }
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
const BACKGROUND = "#14161a";

const SVG_NS = "http://www.w3.org/2000/svg";

/** One PNG per level, keyed by the row count that produced it. */
export type MapImages = ReadonlyMap<number, Blob>;

export async function renderMaps(
  planet: Planet,
  detail: PlanetDetail,
  onLevel?: (size: number) => void,
): Promise<MapImages> {
  const images = new Map<number, Blob>();
  for (const size of DETAIL_LEVELS) {
    onLevel?.(size);
    // Drawing a level holds the thread for as long as it takes, so the message
    // about the level being drawn is given a frame to reach the screen first.
    // Without this the whole run is one freeze with nothing said during it.
    await nextFrame();
    images.set(size, await renderMap(planet, detail, size));
  }
  return images;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function renderMap(planet: Planet, detail: PlanetDetail, size: number): Promise<Blob> {
  const surface = buildSurface(planet, detail, size);
  const map = createHexMap();
  map.render(
    surface.grid,
    surface.heights,
    surface.seaLevel,
    surface.diameterKm,
    surface.caps,
    surface.verdancy,
  );
  map.setPois(marksFor(planet, surface.grid));

  // A point of interest is one hex among thousands, and the marks are what say
  // where. Spec 5.5.
  const svg = map.element.cloneNode(true) as SVGSVGElement;
  const box = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(/\s+/).map(Number);
  const ratio = (box[3] ?? 1) / (box[2] ?? 1);
  const height = Math.round(WIDTH * ratio);

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = STYLES;
  svg.insertBefore(style, svg.firstChild);
  svg.setAttribute("width", String(WIDTH));
  svg.setAttribute("height", String(height));
  svg.setAttribute("xmlns", SVG_NS);

  return rasterise(svg, WIDTH, height);
}

function marksFor(planet: Planet, grid: Parameters<typeof poiPlacements>[0]): PoiMark[] {
  const byCell = new Map<number, PoiMark["kind"]>();
  for (const { poi, cell } of poiPlacements(grid, planet.pois)) {
    // A hex carrying both is marked as a starport, as it is on screen.
    if (poi.kind === "starport" || !byCell.has(cell)) byCell.set(cell, poi.kind);
  }
  return [...byCell].map(([cell, kind]) => ({ cell, kind }));
}

/** Draw a detached SVG onto a canvas and take the PNG off it. */
async function rasterise(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const markup = new XMLSerializer().serializeToString(svg);
  // A blob URL rather than a data URL: at level 48 the markup runs to megabytes,
  // and encoding all of it into a URL is wasted work.
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = await load(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw the map to an image.");
    // The map is drawn against the panel, and the hexes do not fill the net.
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
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

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The map image could not be encoded."));
    }, "image/png");
  });
}
