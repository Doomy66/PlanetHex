import {
  centreOf,
  dotFor,
  hexPoints,
  HEX_HIGH,
  HEX_WIDE,
  COLUMN_STEP,
  PAD,
} from "../chartlayout";
import { SECTOR_COLS, SECTOR_ROWS, SUB_COLS, SUB_ROWS } from "../location";
import type { Sector } from "../gen/sector";
import type { ChartWorld } from "../gen/subsector";

/**
 * The sector map: thirty-two hexes across and forty down, with its sixteen
 * subsectors marked out on it. SectorSpec section 4.
 *
 * The same hexes in the same places as a subsector chart — the arithmetic is
 * shared through chartlayout — over sixteen times the area. What changes is what
 * a hex can hold at that size: a world is a dot and nothing else, because a
 * thousand names is not a map, and the names are one level down where there is
 * room for them.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** How many people a world needs before it is worth a name at this size. */
const NAMED_FROM = 9;

/**
 * How far the view goes in and out. SectorSpec 4.4.
 *
 * One is the whole sector on the page. Four is one subsector filling it, which
 * is the same hexes at the same size the chart of section 4 draws them at, so
 * going in far enough and opening the subsector show the same thing.
 */
const ZOOM = { out: 1, in: 4.4 };

/**
 * Where the detail of a chart starts being worth drawing. SectorSpec 4.4.1.
 *
 * Under this, a world is a dot: a thousand names is not a map. Over it, fewer
 * than four subsectors are on the page and there is room for what a chart shows
 * - the hex number, the starport, the name - so the map stops being a map of a
 * sector and starts being a chart of whatever is under the pointer.
 */
const DETAIL_FROM = 2.2;

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** What colour a world is drawn, the same four the chart uses. */
function worldClass(world: ChartWorld): string {
  const { hydrographics, atmosphere, population } = world.profile;
  if (population === 0) return "sec-world sec-empty";
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "sec-world sec-wet";
  if (atmosphere >= 2) return "sec-world sec-dusty";
  return "sec-world sec-airless";
}

export interface SectorMap {
  readonly element: SVGSVGElement;
  render(sector: Sector): void;
  /** Frame the whole sector again. */
  resetView(): void;
  setSelected(letter: string | null, at: string | null): void;
  /** A subsector picked, by letter: the one the pointer went down on. */
  onPickSubsector(handler: (letter: string) => void): void;
  onPickHex(handler: (at: string) => void): void;
}

export function createSectorMap(): SectorMap {
  const svg = make("svg", { class: "sectormap" });
  const gridLayer = make("g");
  const routeLayer = make("g");
  const worldLayer = make("g");
  const frameLayer = make("g");
  const selectLayer = make("g");
  svg.append(gridLayer, routeLayer, worldLayer, frameLayer, selectLayer);

  const pickedSubsector: ((letter: string) => void)[] = [];
  const pickedHex: ((at: string) => void)[] = [];
  const places = new Map<string, { x: number; y: number }>();
  let selectedLetter: string | null = null;
  let selectedHex: string | null = null;
  let shown: Sector | null = null;
  /** Where the view is: how far in, and what it is centred on. */
  let view = { zoom: ZOOM.out, x: 0, y: 0 };
  let press: { x: number; y: number; from: { x: number; y: number } } | null = null;
  /** What the last draw was drawn at, so a redraw only happens on a change. */
  let detailDrawn = false;

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selectedLetter !== null) {
      const at = frameOf(selectedLetter);
      selectLayer.append(make("rect", { class: "sec-chosen", ...at }));
    }
    if (selectedHex !== null) {
      const where = places.get(selectedHex);
      if (where !== undefined) {
        selectLayer.append(
          make("polygon", { class: "sec-pick", points: hexPoints(where.x, where.y) }),
        );
      }
    }
  }

  /** The box round one subsector, in drawing units. */
  function frameOf(letter: string): { x: number; y: number; width: number; height: number } {
    const at = "ABCDEFGHIJKLMNOP".indexOf(letter.toUpperCase());
    const across = at % 4;
    const down = Math.floor(at / 4);
    const left = PAD + across * SUB_COLS * COLUMN_STEP;
    // Even columns ride half a hex lower, so a box has to start above the
    // highest corner in it and finish below the lowest.
    const top = PAD + down * SUB_ROWS * HEX_HIGH - HEX_HIGH / 2;
    return {
      x: left,
      y: top,
      width: SUB_COLS * COLUMN_STEP + HEX_WIDE / 4,
      height: SUB_ROWS * HEX_HIGH + HEX_HIGH,
    };
  }

  function render(sector: Sector): void {
    shown = sector;
    gridLayer.replaceChildren();
    routeLayer.replaceChildren();
    worldLayer.replaceChildren();
    frameLayer.replaceChildren();
    places.clear();

    const worlds = new Map(sector.worlds.map((world) => [world.at, world]));
    for (let row = 1; row <= SECTOR_ROWS; row++) {
      for (let col = 1; col <= SECTOR_COLS; col++) {
        const { x, y } = centreOf(col, row);
        const at = `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
        places.set(at, { x, y });
        gridLayer.append(make("polygon", { class: "sec-cell", points: hexPoints(x, y) }));
        if (view.zoom >= DETAIL_FROM) {
          const digits = make("text", { class: "sec-at", x, y: y - HEX_HIGH * 0.33 });
          digits.textContent = at;
          gridLayer.append(digits);
        }
      }
    }

    for (const route of sector.routes) {
      const from = places.get(route.from);
      const to = places.get(route.to);
      if (from === undefined || to === undefined) continue;
      routeLayer.append(
        make("line", {
          class: route.kind === "xboat" ? "sec-route sec-xboat" : "sec-route",
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }),
      );
    }

    for (const [at, world] of worlds) {
      const where = places.get(at);
      if (where === undefined) continue;
      const group = make("g", { class: "sec-hex" });
      const title = make("title");
      title.textContent = `${at} ${world.name} ${world.uwp}`;
      group.append(title);
      const close = view.zoom >= DETAIL_FROM;
      if (close) {
        // The starport above the world, the way a chart draws it. SectorSpec
        // 4.4.1: close enough for a hex to hold what a chart puts in one.
        const port = make("text", { class: "sec-port", x: where.x, y: where.y - HEX_HIGH * 0.13 });
        port.textContent = world.profile.starport;
        group.append(port);
      }
      group.append(
        make("circle", {
          class: worldClass(world),
          cx: where.x,
          cy: where.y,
          r: dotFor(world.profile.population),
        }),
      );
      if (close || world.profile.population >= NAMED_FROM) {
        const name = make("text", { class: "sec-name", x: where.x, y: where.y + HEX_HIGH * 0.36 });
        name.textContent = world.name;
        group.append(name);
      }
      group.addEventListener("click", () => {
        for (const handler of pickedHex) handler(at);
      });
      worldLayer.append(group);
    }

    // The sixteen boxes over the top, each one a way in. SectorSpec 4.3.
    for (const letter of "ABCDEFGHIJKLMNOP") {
      const box = frameOf(letter);
      const group = make("g", { class: "sec-frame", tabindex: 0, role: "button" });
      const title = make("title");
      title.textContent = `Subsector ${letter}`;
      group.append(title);
      group.append(make("rect", { class: "sec-box", ...box }));
      const mark = make("text", {
        class: "sec-letter",
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
      mark.textContent = letter;
      group.append(mark);
      const open = () => {
        for (const handler of pickedSubsector) handler(letter);
      };
      group.addEventListener("dblclick", open);
      group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
      frameLayer.append(group);
    }

    showView();
    drawSelection();
  }

  /** How big the whole sector is, in drawing units. */
  function size(): { width: number; height: number } {
    return {
      width: PAD * 2 + (SECTOR_COLS - 1) * COLUMN_STEP + HEX_WIDE,
      height: PAD * 2 + SECTOR_ROWS * HEX_HIGH + HEX_HIGH / 2,
    };
  }

  /**
   * The window on to the drawing. SectorSpec 4.4.
   *
   * The whole sector at zoom one, and a window that many times smaller as it
   * goes in, held so the view cannot be panned off the edge of the map: a map
   * that can be lost is a map that will be.
   */
  function showView(): void {
    const { width, height } = size();
    const across = width / view.zoom;
    const down = height / view.zoom;
    const x = Math.min(Math.max(view.x, 0), width - across);
    const y = Math.min(Math.max(view.y, 0), height - down);
    view = { ...view, x, y };
    svg.setAttribute("viewBox", `${x} ${y} ${across} ${down}`);
    // What a hex can hold depends on how close it is, so what is drawn in one
    // changes as the view goes in. 4.4.1.
    svg.classList.toggle("sec-close", view.zoom >= DETAIL_FROM);
  }

  /** Go in or out about a point of the drawing, keeping that point still. */
  function zoomAt(by: number, at: { x: number; y: number }): void {
    const held = Math.min(ZOOM.in, Math.max(ZOOM.out, view.zoom * by));
    if (held === view.zoom) return;
    const { width, height } = size();
    // The point under the pointer stays under the pointer, which is what makes
    // a wheel feel like a magnifier rather than a scrollbar.
    const share = { x: (at.x - view.x) / (width / view.zoom), y: (at.y - view.y) / (height / view.zoom) };
    view = {
      zoom: held,
      x: at.x - share.x * (width / held),
      y: at.y - share.y * (height / held),
    };
    showView();
    drawDetail();
  }

  /** Where a pointer is, in the drawing's own units. */
  function pointIn(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const box = svg.getBoundingClientRect();
    const { width, height } = size();
    const across = width / view.zoom;
    const down = height / view.zoom;
    return {
      x: view.x + ((event.clientX - box.left) / box.width) * across,
      y: view.y + ((event.clientY - box.top) / box.height) * down,
    };
  }

  /** Redraw at the level of detail the view is now at. */
  function drawDetail(): void {
    if (shown === null) return;
    const close = view.zoom >= DETAIL_FROM;
    if (close === detailDrawn) return;
    detailDrawn = close;
    render(shown);
  }

  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomAt(Math.pow(0.999, event.deltaY), pointIn(event));
    },
    { passive: false },
  );

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    press = { x: event.clientX, y: event.clientY, from: { x: view.x, y: view.y } };
  });
  svg.addEventListener("pointermove", (event) => {
    if (press === null) return;
    const box = svg.getBoundingClientRect();
    const { width, height } = size();
    // A drag moves the same amount of map however far in the view is.
    view.x = press.from.x - ((event.clientX - press.x) / box.width) * (width / view.zoom);
    view.y = press.from.y - ((event.clientY - press.y) / box.height) * (height / view.zoom);
    showView();
  });
  const letGo = (): void => {
    press = null;
  };
  svg.addEventListener("pointerup", letGo);
  svg.addEventListener("pointercancel", letGo);
  svg.addEventListener("pointerleave", letGo);

  return {
    element: svg,
    render,
    resetView() {
      view = { zoom: ZOOM.out, x: 0, y: 0 };
      showView();
      drawDetail();
    },
    setSelected(letter, at) {
      selectedLetter = letter;
      selectedHex = at;
      drawSelection();
    },
    onPickSubsector(handler) {
      pickedSubsector.push(handler);
    },
    onPickHex(handler) {
      pickedHex.push(handler);
    },
  };
}
